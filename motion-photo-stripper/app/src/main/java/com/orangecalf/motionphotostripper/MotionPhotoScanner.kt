package com.orangecalf.motionphotostripper

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.merge
import java.io.File

data class MotionPhotoFile(
    val uri: Uri,
    val path: String,
    val name: String,
    val size: Long,
    val detection: DetectionResult
)

class MotionPhotoScanner(private val context: Context) {

    private val contentResolver get() = context.contentResolver

    private val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }

    // Extra directories that may contain Samsung Motion Photos but aren't always indexed by MediaStore.
    // WhatsApp scoped-storage paths (Android 10+) are the primary example.
    private val extraScanDirs: List<File> by lazy {
        val root = Environment.getExternalStorageDirectory()
        listOf(
            // Standard WhatsApp
            File(root, "WhatsApp/Media/WhatsApp Images"),
            File(root, "WhatsApp/Media/WhatsApp Images/Sent"),
            // Android 10+ scoped storage (com.whatsapp)
            File(root, "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images"),
            File(root, "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent"),
            // WhatsApp Business
            File(root, "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Images"),
            File(root, "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Images/Sent"),
        )
    }

    /**
     * Count all JPEG images accessible via MediaStore. Used to show overall scan progress.
     */
    fun countJpegs(): Int {
        val cursor = contentResolver.query(
            collection,
            arrayOf(MediaStore.Images.Media._ID),
            "${MediaStore.Images.Media.MIME_TYPE} IN (?,?)",
            arrayOf("image/jpeg", "image/jpg"),
            null
        ) ?: return 0
        return cursor.use { it.count }
    }

    /**
     * Scan all accessible JPEG files and emit those identified as Samsung Motion Photos.
     * Combines a MediaStore scan (catches gallery and Downloads photos) with explicit
     * directory scans for WhatsApp folders (which may live in scoped storage and not
     * appear in MediaStore). Deduplicates by canonical file path.
     * Runs on [Dispatchers.IO].
     */
    fun scan(): Flow<MotionPhotoFile> = flow {
        val seen = HashSet<String>()

        // ── MediaStore pass ────────────────────────────────────────────────
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.SIZE
        )

        val cursor = contentResolver.query(
            collection,
            projection,
            "${MediaStore.Images.Media.MIME_TYPE} IN (?,?)",
            arrayOf("image/jpeg", "image/jpg"),
            null
        )

        cursor?.use { c ->
            val idCol = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val dataCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)
            val nameCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
            val sizeCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)

            while (c.moveToNext()) {
                val id = c.getLong(idCol)
                val path = c.getString(dataCol) ?: continue
                val name = c.getString(nameCol) ?: File(path).name
                val size = c.getLong(sizeCol)

                if (size < 500_000L) continue

                val file = File(path)
                if (!file.exists() || !file.canRead()) continue
                val canonical = file.canonicalPath
                if (!seen.add(canonical)) continue

                val detection = MotionPhotoProcessor.detect(file)
                if (!detection.isMotionPhoto) continue

                val uri = Uri.withAppendedPath(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    id.toString()
                )
                emit(MotionPhotoFile(uri, path, name, size, detection))
            }
        }

        // ── Extra directory pass (WhatsApp etc.) ──────────────────────────
        for (dir in extraScanDirs) {
            if (!dir.exists() || !dir.isDirectory || !dir.canRead()) continue

            dir.walkTopDown()
                .maxDepth(2)
                .filter { it.isFile }
                .filter { it.extension.lowercase() in setOf("jpg", "jpeg") }
                .filter { it.length() >= 500_000L }
                .forEach { file ->
                    val canonical = try { file.canonicalPath } catch (_: Exception) { file.absolutePath }
                    if (!seen.add(canonical)) return@forEach

                    val detection = MotionPhotoProcessor.detect(file)
                    if (!detection.isMotionPhoto) return@forEach

                    emit(
                        MotionPhotoFile(
                            uri = Uri.fromFile(file),
                            path = file.absolutePath,
                            name = file.name,
                            size = file.length(),
                            detection = detection
                        )
                    )
                }
        }
    }.flowOn(Dispatchers.IO)
}
