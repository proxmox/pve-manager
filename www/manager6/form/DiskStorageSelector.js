Ext.define('PVE.form.DiskStorageSelector', {
    extend: 'Ext.container.Container',
    alias: 'widget.pveDiskStorageSelector',

    layout: 'fit',
    defaults: {
	margin: '0 0 5 0'
    },

    // the fieldLabel for the storageselector
    storageLabel: gettext('Storage'),

    // the content to show (e.g., images or rootdir)
    storageContent: undefined,

    // if true, selects the first available storage
    autoSelect: false,

    allowBlank: false,
    emptyText: '',

    // hides the selection field
    // this is always hidden on creation,
    // and only shown when the storage needs a selection and
    // hideSelection is not true
    hideSelection: undefined,

    // hides the size field (e.g, for the efi disk dialog)
    hideSize: false,

    changeStorage: function(f, value) {
	var me = this;
	var formatsel = me.getComponent('diskformat');
	var hdfilesel = me.getComponent('hdimage');
	var hdsizesel = me.getComponent('disksize');

	// initial store load, and reset/deletion of the storage
	if (!value) {
	    hdfilesel.setDisabled(true);
	    hdfilesel.setVisible(false);

	    formatsel.setDisabled(true);
	    return;
	}

	var rec = f.store.getById(value);
	// if the storage is not defined, or valid,
	// we cannot know what to enable/disable
	if (!rec) {
	    return;
	}

	var selectformat = false;
	if (rec.data.format) {
	    var format = rec.data.format[0]; // 0 is the formats, 1 the default in the backend
	    delete format.subvol; // we never need subvol in the gui
	    selectformat = (Ext.Object.getSize(format) > 1);
	}

	var select = !!rec.data.select_existing && !me.hideSelection;

	formatsel.setDisabled(!selectformat);
	formatsel.setValue(selectformat ? 'qcow2' : 'raw');

	hdfilesel.setDisabled(!select);
	hdfilesel.setVisible(select);
	if (select) {
	    hdfilesel.setStorage(value);
	}

	hdsizesel.setDisabled(select || me.hideSize);
	hdsizesel.setVisible(!select && !me.hideSize);
    },

    initComponent: function() {
	var me = this;

	me.items = [
	    {
		xtype: 'pveStorageSelector',
		itemId: 'hdstorage',
		name: 'hdstorage',
		reference: 'hdstorage',
		fieldLabel: me.storageLabel,
		nodename: me.nodename,
		storageContent: me.storageContent,
		autoSelect: me.autoSelect,
		allowBlank: me.allowBlank,
		emptyText: me.emptyText,
		listeners: {
		    change: {
			fn: me.changeStorage,
			scope: me
		    }
		}
	    },
	    {
		xtype: 'pveFileSelector',
		name: 'hdimage',
		reference: 'hdimage',
		itemId: 'hdimage',
		fieldLabel: gettext('Disk image'),
		nodename: me.nodename,
		disabled: true,
		hidden: true
	    },
	    {
		xtype: 'numberfield',
		itemId: 'disksize',
		reference: 'disksize',
		name: 'disksize',
		fieldLabel: gettext('Disk size') + ' (GB)',
		hidden: me.hideSize,
		disabled: me.hideSize,
		minValue: 0.001,
		maxValue: 128*1024,
		decimalPrecision: 3,
		value: '32',
		allowBlank: false
	    },
	    {
		xtype: 'pveDiskFormatSelector',
		itemId: 'diskformat',
		reference: 'diskformat',
		name: 'diskformat',
		fieldLabel: gettext('Format'),
		nodename: me.nodename,
		disabled: true,
		hidden: me.storageContent === 'rootdir',
		value: 'qcow2',
		allowBlank: false
	    }
	];

	me.callParent();
    }
});
