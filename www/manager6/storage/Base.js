Ext.define('PVE.panel.StorageBase', {
    extend: 'Proxmox.panel.InputPanel',
    controller: 'storageEdit',

    type: '',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = me.type;
	} else {
	    delete values.storage;
	}

	values.disable = values.enable ? 0 : 1;
	delete values.enable;

	return values;
    },

    initComponent: function() {
	var me = this;

	me.column1.unshift({
	    xtype: me.isCreate ? 'textfield' : 'displayfield',
	    name: 'storage',
	    value: me.storageId || '',
	    fieldLabel: 'ID',
	    vtype: 'StorageId',
	    allowBlank: false,
	});

	me.column2 = me.column2 || [];
	me.column2.unshift(
	    {
		xtype: 'pveNodeSelector',
		name: 'nodes',
		disabled: me.storageId === 'local',
		fieldLabel: gettext('Nodes'),
		emptyText: gettext('All') + ' (' + gettext('No restrictions') +')',
		multiSelect: true,
		autoSelect: false,
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'enable',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('Enable'),
	    },
	);

	me.callParent();
    },
});

Ext.define('PVE.storage.BaseEdit', {
    extend: 'Proxmox.window.Edit',

    apiCallDone: function(success, response, options) {
	let me = this;
	if (typeof me.ipanel.apiCallDone === "function") {
	    me.ipanel.apiCallDone(success, response, options);
	}
    },

    initComponent: function() {
	var me = this;

	me.isCreate = !me.storageId;

	if (me.isCreate) {
	    me.url = '/api2/extjs/storage';
	    me.method = 'POST';
	} else {
	    me.url = '/api2/extjs/storage/' + me.storageId;
	    me.method = 'PUT';
	}

	me.ipanel = Ext.create(me.paneltype, {
	    title: gettext('General'),
	    type: me.type,
	    isCreate: me.isCreate,
	    storageId: me.storageId,
	});

	Ext.apply(me, {
            subject: PVE.Utils.format_storage_type(me.type),
	    isAdd: true,
	    bodyPadding: 0,
	    items: {
		xtype: 'tabpanel',
		region: 'center',
		layout: 'fit',
		bodyPadding: 10,
		items: [
		    me.ipanel,
		    {
			xtype: 'pveEditPruneInputPanel',
			title: gettext('Backup Retention'),
			isCreate: me.isCreate,
			keepAllDefaultForCreate: true,
			showPBSHint: me.ipanel.isPBS,
			fallbackHintHtml: gettext('Without any keep option, the node\'s vzdump.conf or `keep-all` is used as fallback for backup jobs'),
		    },
		],
	    },
	});

	if (me.ipanel.extraTabs) {
	    me.ipanel.extraTabs.forEach(panel => {
		panel.isCreate = me.isCreate;
		me.items.items.push(panel);
	    });
	}

	me.callParent();

	if (!me.canDoBackups) {
	    // cannot mask now, not fully rendered until activated
	    me.down('pmxPruneInputPanel').needMask = true;
	}

	if (!me.isCreate) {
	    me.load({
		success: function(response, options) {
		    var values = response.result.data;
		    var ctypes = values.content || '';

		    values.content = ctypes.split(',');

		    if (values.nodes) {
			values.nodes = values.nodes.split(',');
		    }
		    values.enable = values.disable ? 0 : 1;
		    if (values['prune-backups']) {
			let retention = PVE.Parser.parsePropertyString(values['prune-backups']);
			delete values['prune-backups'];
			Object.assign(values, retention);
		    } else if (values.maxfiles !== undefined) {
			if (values.maxfiles > 0) {
			    values['keep-last'] = values.maxfiles;
			}
			delete values.maxfiles;
		    }

		    me.query('inputpanel').forEach(panel => {
			panel.setValues(values);
		    });
		},
	    });
	}
    },
});
