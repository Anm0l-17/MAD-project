package com.ciphernode.app.tor

data class TorStatus(
    val running: Boolean,
    val bootstrapped: Boolean,
    val progress: Int,
    val status: String,
    val socksPort: Int,
    val lastError: String?
)
