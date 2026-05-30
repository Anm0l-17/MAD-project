package com.ciphernode.app.tor

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.ciphernode.app.R

class TorForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                TorManager.stop()
                stopSelf()
                return START_NOT_STICKY
            }
        }

        startForeground(NOTIFICATION_ID, buildNotification())
        TorManager.start(this)
        return START_STICKY
    }

    override fun onDestroy() {
        TorManager.stop()
        super.onDestroy()
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("CipherNode Tor Runtime")
        .setContentText("Tor is running to protect your network traffic.")
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .also { builder ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val manager = getSystemService(NotificationManager::class.java)
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Tor Runtime",
                    NotificationManager.IMPORTANCE_LOW
                )
                manager.createNotificationChannel(channel)
            }
        }
        .build()

    companion object {
        const val ACTION_START = "com.ciphernode.app.tor.START"
        const val ACTION_STOP = "com.ciphernode.app.tor.STOP"
        const val CHANNEL_ID = "ciphernode_tor"
        const val NOTIFICATION_ID = 4201
    }
}
