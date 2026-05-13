package com.orangecalf.motionphotostripper

import android.util.Log
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile

data class DetectionResult(
    val isMotionPhoto: Boolean,
    val splitOffset: Long = -1L,
    val method: String = ""
)

object MotionPhotoProcessor {

    private const val TAG = "MotionPhotoProcessor"

    // "MotionPhoto_Data" — the 16-byte binary separator Samsung appends after the JPEG EOI
    private val MARKER_BYTES = "MotionPhoto_Data".toByteArray(Charsets.US_ASCII)

    // XMP attributes that identify a Samsung / GCamera motion photo
    private val MOTION_PHOTO_PATTERNS = listOf(
        "MotionPhoto=\"1\"",
        "MotionPhoto='1'",
        "MotionPhoto=1",
        "GCamera:MotionPhoto"
    )

    // How much of the file header to read for XMP detection (XMP is always in APP1 near start)
    private const val XMP_READ_BYTES = 131_072 // 128 KB

    // Chunk size for backward binary marker scan
    private const val SCAN_CHUNK = 1_048_576 // 1 MB

    /**
     * Detect whether [file] is a Samsung Motion Photo, and if so, determine the byte offset
     * at which the JPEG data ends (the split point for stripping).
     */
    fun detect(file: File): DetectionResult {
        return try {
            val xmpResult = detectViaXmp(file)
            if (xmpResult.isMotionPhoto) return xmpResult
            detectViaMarkerScan(file)
        } catch (e: IOException) {
            Log.w(TAG, "Detection failed for ${file.name}: ${e.message}")
            DetectionResult(false)
        }
    }

    /**
     * Read the JPEG header bytes to find XMP metadata. Fast path: O(128 KB) per file.
     * Also extracts MicroVideoOffset for an O(1) split point when present.
     */
    private fun detectViaXmp(file: File): DetectionResult {
        val buffer = ByteArray(XMP_READ_BYTES)
        val bytesRead = file.inputStream().use { stream ->
            var total = 0
            while (total < XMP_READ_BYTES) {
                val n = stream.read(buffer, total, XMP_READ_BYTES - total)
                if (n < 0) break
                total += n
            }
            total
        }
        if (bytesRead < 4) return DetectionResult(false)

        // Treat bytes as Latin-1 so every byte maps 1:1 to a char (XMP is ASCII-safe)
        val header = String(buffer, 0, bytesRead, Charsets.ISO_8859_1)

        val isMotion = MOTION_PHOTO_PATTERNS.any { header.contains(it) }
        if (!isMotion) return DetectionResult(false)

        val offset = extractMicroVideoOffset(header, file.length())
        return if (offset >= 0) {
            DetectionResult(true, offset, "xmp-offset")
        } else {
            // Detected via XMP but no precise offset — need a full marker scan later
            DetectionResult(true, -1L, "xmp-detected")
        }
    }

    /**
     * Parse GCamera:MicroVideoOffset from the XMP string and convert to an absolute byte offset.
     * MicroVideoOffset = bytes from end-of-file to start of video → JPEG ends at fileSize - offset - markerLen.
     * Returns -1 if the tag is absent or the calculated position is implausible.
     */
    private fun extractMicroVideoOffset(xmpText: String, fileSize: Long): Long {
        val tagIdx = xmpText.indexOf("MicroVideoOffset")
        if (tagIdx < 0) return -1L

        val tail = xmpText.substring(tagIdx + "MicroVideoOffset".length, minOf(tagIdx + 40, xmpText.length))
        val match = Regex("""=["']?(\d+)["']?""").find(tail) ?: return -1L
        val videoSizeFromEnd = match.groupValues[1].toLongOrNull() ?: return -1L

        // The video starts at (fileSize - videoSizeFromEnd); the marker immediately precedes it
        val markerPos = fileSize - videoSizeFromEnd - MARKER_BYTES.size
        return if (markerPos > 0) markerPos else -1L
    }

    /**
     * Verify the 16-byte marker exists at [pos] in [file].
     * Used during the strip pass to confirm an XMP-derived offset before trusting it.
     */
    fun verifyMarkerAt(file: File, pos: Long): Boolean {
        if (pos < 0 || pos + MARKER_BYTES.size > file.length()) return false
        return try {
            RandomAccessFile(file, "r").use { raf ->
                raf.seek(pos)
                val buf = ByteArray(MARKER_BYTES.size)
                raf.readFully(buf)
                buf.contentEquals(MARKER_BYTES)
            }
        } catch (e: IOException) {
            false
        }
    }

    /**
     * Scan from end-of-file backward in 1 MB chunks, looking for the [MARKER_BYTES] sequence.
     * Slower than the XMP path but handles files with no or malformed XMP.
     */
    private fun detectViaMarkerScan(file: File): DetectionResult {
        val markerPos = findMarkerPosition(file)
        return if (markerPos >= 0) DetectionResult(true, markerPos, "binary-scan")
        else DetectionResult(false)
    }

    /**
     * Return the byte position of the start of [MARKER_BYTES] in [file], or -1 if not found.
     * Searches backward from the end so it finds the marker quickly for typical file layouts.
     */
    fun findMarkerPosition(file: File): Long {
        val fileLen = file.length()
        if (fileLen < MARKER_BYTES.size) return -1L

        return try {
            RandomAccessFile(file, "r").use { raf ->
                // Overlap chunks by markerLen-1 to catch markers spanning a chunk boundary
                val overlap = MARKER_BYTES.size - 1
                var chunkEnd = fileLen
                while (chunkEnd > 0) {
                    val chunkStart = maxOf(0L, chunkEnd - SCAN_CHUNK)
                    val readLen = (chunkEnd - chunkStart).toInt() + if (chunkEnd < fileLen) overlap else 0
                    val startWithOverlap = maxOf(0L, chunkEnd - SCAN_CHUNK)

                    val buf = ByteArray(minOf(readLen.toLong(), fileLen - startWithOverlap).toInt())
                    raf.seek(startWithOverlap)
                    raf.readFully(buf)

                    val idx = indexOf(buf, MARKER_BYTES)
                    if (idx >= 0) return@use startWithOverlap + idx

                    if (chunkStart == 0L) break
                    chunkEnd = chunkStart + overlap
                }
                -1L
            }
        } catch (e: IOException) {
            Log.w(TAG, "Marker scan failed for ${file.name}: ${e.message}")
            -1L
        }
    }

    /**
     * Strip the motion video from [src], writing a JPEG-only file to [dst].
     * [detection] must have [DetectionResult.isMotionPhoto] == true.
     * Returns true on success; [dst] is deleted on failure.
     */
    fun strip(src: File, dst: File, detection: DetectionResult): Boolean {
        var splitOffset = detection.splitOffset

        // If XMP detected the photo but didn't give a precise offset, scan now
        if (splitOffset < 0) {
            splitOffset = findMarkerPosition(src)
            if (splitOffset < 0) {
                Log.w(TAG, "Cannot find split point for ${src.name} — skipping")
                return false
            }
        }

        // If the XMP-derived offset is wrong (marker not at expected position), try a full scan
        if (!verifyMarkerAt(src, splitOffset)) {
            Log.d(TAG, "XMP offset mismatch for ${src.name}, falling back to scan")
            splitOffset = findMarkerPosition(src)
            if (splitOffset < 0) return false
        }

        return copyBytes(src, dst, splitOffset)
    }

    private fun copyBytes(src: File, dst: File, byteCount: Long): Boolean {
        return try {
            src.inputStream().buffered(65_536).use { input ->
                dst.outputStream().buffered(65_536).use { output ->
                    val buf = ByteArray(65_536)
                    var remaining = byteCount
                    while (remaining > 0) {
                        val toRead = minOf(buf.size.toLong(), remaining).toInt()
                        val read = input.read(buf, 0, toRead)
                        if (read < 0) break
                        output.write(buf, 0, read)
                        remaining -= read
                    }
                }
            }
            true
        } catch (e: IOException) {
            Log.e(TAG, "Copy failed for ${src.name}: ${e.message}")
            dst.delete()
            false
        }
    }

    /** Naive byte-pattern search; fast enough for 1 MB chunks. */
    private fun indexOf(haystack: ByteArray, needle: ByteArray): Int {
        val limit = haystack.size - needle.size
        outer@ for (i in 0..limit) {
            for (j in needle.indices) {
                if (haystack[i + j] != needle[j]) continue@outer
            }
            return i
        }
        return -1
    }
}
