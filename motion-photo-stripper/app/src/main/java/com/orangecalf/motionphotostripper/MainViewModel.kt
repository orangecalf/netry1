package com.orangecalf.motionphotostripper

import android.app.Application
import android.os.Environment
import android.os.StatFs
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

enum class ProcessMode { OVERWRITE, SAVE_AS_COPY }

sealed class AppState {
    object Idle : AppState()
    data class Scanning(val found: Int) : AppState()
    data class ScanComplete(val files: List<MotionPhotoFile>) : AppState()
    data class Processing(val current: Int, val total: Int, val currentName: String) : AppState()
    data class Done(val processed: Int, val errors: Int, val errorFiles: List<String>) : AppState()
    data class Error(val message: String) : AppState()
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val scanner = MotionPhotoScanner(application)

    private val _state = MutableStateFlow<AppState>(AppState.Idle)
    val state: StateFlow<AppState> = _state.asStateFlow()

    private val _processMode = MutableStateFlow(ProcessMode.SAVE_AS_COPY)
    val processMode: StateFlow<ProcessMode> = _processMode.asStateFlow()

    private var scannedFiles: List<MotionPhotoFile> = emptyList()
    private var activeJob: Job? = null

    fun setMode(mode: ProcessMode) {
        _processMode.value = mode
    }

    fun startScan() {
        activeJob?.cancel()
        _state.value = AppState.Scanning(0)
        val found = mutableListOf<MotionPhotoFile>()

        activeJob = viewModelScope.launch {
            try {
                scanner.scan().collect { file ->
                    found.add(file)
                    _state.value = AppState.Scanning(found.size)
                }
                scannedFiles = found.toList()
                _state.value = AppState.ScanComplete(scannedFiles)
            } catch (e: Exception) {
                _state.value = AppState.Error("Scan failed: ${e.message}")
            }
        }
    }

    fun startProcessing() {
        val files = scannedFiles
        if (files.isEmpty()) return
        val mode = _processMode.value

        activeJob?.cancel()
        activeJob = viewModelScope.launch {
            val processed = mutableListOf<String>()
            val errorFiles = mutableListOf<String>()

            val outputDir = if (mode == ProcessMode.SAVE_AS_COPY) {
                withContext(Dispatchers.IO) { prepareOutputDir() }
            } else null

            if (mode == ProcessMode.SAVE_AS_COPY && outputDir == null) {
                _state.value = AppState.Error("Cannot create output directory in Pictures/StrippedPhotos")
                return@launch
            }

            // Warn if insufficient space when copying
            if (mode == ProcessMode.SAVE_AS_COPY && outputDir != null) {
                val neededBytes = files.sumOf { it.size }
                val available = StatFs(outputDir.path).availableBytes
                if (available < neededBytes) {
                    val neededMb = neededBytes / 1_048_576
                    val availMb = available / 1_048_576
                    _state.value = AppState.Error(
                        "Insufficient storage: need ~${neededMb} MB, have ${availMb} MB free"
                    )
                    return@launch
                }
            }

            files.forEachIndexed { index, photo ->
                _state.value = AppState.Processing(index + 1, files.size, photo.name)

                val success = withContext(Dispatchers.IO) {
                    processFile(photo, mode, outputDir)
                }

                if (success) processed.add(photo.name)
                else errorFiles.add(photo.name)
            }

            _state.value = AppState.Done(processed.size, errorFiles.size, errorFiles)
        }
    }

    private fun processFile(photo: MotionPhotoFile, mode: ProcessMode, outputDir: File?): Boolean {
        return try {
            val src = File(photo.path)
            when (mode) {
                ProcessMode.SAVE_AS_COPY -> {
                    val dst = File(outputDir!!, photo.name)
                    MotionPhotoProcessor.strip(src, dst, photo.detection)
                }
                ProcessMode.OVERWRITE -> {
                    val tmp = File(src.parent, "${src.name}.mps_tmp")
                    val ok = MotionPhotoProcessor.strip(src, tmp, photo.detection)
                    if (ok) {
                        src.delete()
                        tmp.renameTo(src)
                    } else {
                        tmp.delete()
                        false
                    }
                }
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun prepareOutputDir(): File? {
        return try {
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                "StrippedPhotos"
            )
            if (dir.mkdirs() || dir.isDirectory) dir else null
        } catch (e: Exception) {
            null
        }
    }

    fun cancel() {
        activeJob?.cancel()
        _state.value = AppState.Idle
    }

    fun reset() {
        scannedFiles = emptyList()
        _state.value = AppState.Idle
    }
}
