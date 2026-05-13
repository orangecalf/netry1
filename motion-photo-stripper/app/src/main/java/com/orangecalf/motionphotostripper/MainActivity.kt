package com.orangecalf.motionphotostripper

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.orangecalf.motionphotostripper.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: MainViewModel by viewModels()

    // Requests READ_MEDIA_IMAGES / READ_EXTERNAL_STORAGE for gallery scanning
    private val readPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { it }) {
            offerWhatsAppAccessThenScan()
        } else {
            showDialog(
                getString(R.string.dialog_permission_title),
                getString(R.string.dialog_permission_message)
            )
        }
    }

    // Opens "All files access" settings for MANAGE_EXTERNAL_STORAGE (scan pass — WhatsApp)
    private val whatsAppStorageLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Proceed with scan regardless of whether the user granted or denied
        viewModel.startScan()
    }

    // Opens "All files access" settings for MANAGE_EXTERNAL_STORAGE (write pass — Overwrite mode)
    private val overwriteStorageLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (hasManageStoragePermission()) {
            viewModel.startProcessing()
        } else {
            showDialog(
                getString(R.string.dialog_storage_title),
                getString(R.string.dialog_storage_message_denied)
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnScan.setOnClickListener { requestReadAndScan() }
        binding.btnProcess.setOnClickListener { requestWriteAndProcess() }
        binding.btnCancel.setOnClickListener { viewModel.cancel() }
        binding.btnReset.setOnClickListener { viewModel.reset() }

        binding.radioGroupMode.setOnCheckedChangeListener { _, checkedId ->
            viewModel.setMode(
                if (checkedId == R.id.radioOverwrite) ProcessMode.OVERWRITE
                else ProcessMode.SAVE_AS_COPY
            )
        }

        lifecycleScope.launch {
            viewModel.state.collect { renderState(it) }
        }
        lifecycleScope.launch {
            viewModel.processMode.collect { mode ->
                binding.radioOverwrite.isChecked = mode == ProcessMode.OVERWRITE
                binding.radioCopy.isChecked = mode == ProcessMode.SAVE_AS_COPY
            }
        }
    }

    private fun renderState(state: AppState) {
        with(binding) {
            progressBar.visibility = View.GONE
            tvStatus.visibility = View.VISIBLE
            btnProcess.isEnabled = false
            btnScan.isEnabled = true
            btnCancel.visibility = View.GONE
            btnReset.visibility = View.GONE
            layoutSummary.visibility = View.GONE
            setModeGroupEnabled(true)

            when (state) {
                is AppState.Idle -> {
                    tvStatus.text = getString(R.string.status_idle)
                }

                is AppState.Scanning -> {
                    progressBar.isIndeterminate = true
                    progressBar.visibility = View.VISIBLE
                    btnScan.isEnabled = false
                    btnCancel.visibility = View.VISIBLE
                    setModeGroupEnabled(false)
                    tvStatus.text = if (state.found == 0) {
                        getString(R.string.status_scanning)
                    } else {
                        resources.getQuantityString(
                            R.plurals.status_scanning_found, state.found, state.found
                        )
                    }
                }

                is AppState.ScanComplete -> {
                    val count = state.files.size
                    tvStatus.text = if (count == 0) {
                        getString(R.string.status_none_found)
                    } else {
                        resources.getQuantityString(R.plurals.status_scan_complete, count, count)
                    }
                    btnProcess.isEnabled = count > 0
                }

                is AppState.Processing -> {
                    progressBar.isIndeterminate = false
                    progressBar.max = state.total
                    progressBar.progress = state.current
                    progressBar.visibility = View.VISIBLE
                    btnScan.isEnabled = false
                    btnCancel.visibility = View.VISIBLE
                    setModeGroupEnabled(false)
                    tvStatus.text = getString(
                        R.string.status_processing,
                        state.current,
                        state.total,
                        state.currentName
                    )
                }

                is AppState.Done -> {
                    tvStatus.text = getString(R.string.status_done)
                    layoutSummary.visibility = View.VISIBLE
                    tvSummaryProcessed.text = getString(R.string.summary_processed, state.processed)
                    tvSummaryErrors.text = getString(R.string.summary_errors, state.errors)
                    tvErrorList.visibility = if (state.errorFiles.isEmpty()) View.GONE else View.VISIBLE
                    tvErrorList.text = state.errorFiles.joinToString("\n")
                    btnReset.visibility = View.VISIBLE
                }

                is AppState.Error -> {
                    tvStatus.text = getString(R.string.status_error, state.message)
                    btnReset.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun setModeGroupEnabled(enabled: Boolean) {
        binding.radioGroupMode.isEnabled = enabled
        binding.radioOverwrite.isEnabled = enabled
        binding.radioCopy.isEnabled = enabled
    }

    // ── Permission helpers ───────────────────────────────────────────────────

    private fun requestReadAndScan() {
        val readPerms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

        val missing = readPerms.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) {
            offerWhatsAppAccessThenScan()
        } else {
            readPermissionLauncher.launch(missing.toTypedArray())
        }
    }

    /**
     * On Android 11+, if MANAGE_EXTERNAL_STORAGE is not yet granted, prompt the user once
     * to grant it so that WhatsApp scoped-storage directories can be scanned. The scan
     * proceeds regardless of the outcome.
     */
    private fun offerWhatsAppAccessThenScan() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !hasManageStoragePermission()) {
            AlertDialog.Builder(this)
                .setTitle(R.string.dialog_whatsapp_title)
                .setMessage(R.string.dialog_whatsapp_message)
                .setPositiveButton(R.string.dialog_whatsapp_grant) { _, _ ->
                    val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    whatsAppStorageLauncher.launch(intent)
                }
                .setNegativeButton(R.string.dialog_whatsapp_skip) { _, _ ->
                    viewModel.startScan()
                }
                .show()
        } else {
            viewModel.startScan()
        }
    }

    private fun requestWriteAndProcess() {
        if (!hasManageStoragePermission()) {
            val messageRes = if (viewModel.processMode.value == ProcessMode.OVERWRITE)
                R.string.dialog_storage_message
            else
                R.string.dialog_storage_message_copy

            AlertDialog.Builder(this)
                .setTitle(R.string.dialog_storage_title)
                .setMessage(messageRes)
                .setPositiveButton(R.string.dialog_storage_ok) { _, _ ->
                    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                            data = Uri.parse("package:$packageName")
                        }
                    } else {
                        Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                    }
                    overwriteStorageLauncher.launch(intent)
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        } else {
            viewModel.startProcessing()
        }
    }

    private fun hasManageStoragePermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(
                this, Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun showDialog(title: String, message: String) {
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }
}
