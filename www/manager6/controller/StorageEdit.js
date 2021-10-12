Ext.define('PVE.controller.StorageEdit', {
    extend: 'Ext.app.ViewController',
    alias: 'controller.storageEdit',
    control: {
	'field[name=content]': {
	    change: function(field, value) {
		const hasImages = Ext.Array.contains(value, 'images');
		const prealloc = field.up('form').getForm().findField('preallocation');
		if (prealloc) {
		    prealloc.setDisabled(!hasImages);
		}

		var hasBackups = Ext.Array.contains(value, 'backup');
		var maxfiles = this.lookupReference('maxfiles');
		if (!maxfiles) {
		    return;
		}

		if (!hasBackups) {
		// clear values which will never be submitted
		    maxfiles.reset();
		}
		maxfiles.setDisabled(!hasBackups);
	    },
	},
    },
});
