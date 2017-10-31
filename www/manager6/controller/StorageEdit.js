Ext.define('PVE.controller.StorageEdit', {
    extend: 'Ext.app.ViewController',
    alias: 'controller.storageEdit',
    control: {
	'field[name=content]': {
	    change: function(field, value) {
		var hasBackups = Ext.Array.contains(value, 'backup');
		var maxfiles = this.lookupReference('maxfiles');

		if (!hasBackups) {
		// clear values which will never be submitted
		    maxfiles.reset();
		}
		maxfiles.setDisabled(!hasBackups);
	    }
	}
    }
});
