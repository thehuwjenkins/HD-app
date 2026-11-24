// Loaded last: draw the first screen and check the backup status.
render();
if (me.owner) hqBackupStatus();
else $("hqBackupStatus").remove();
