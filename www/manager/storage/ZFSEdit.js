Ext.define('PVE.storage.ZFSInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
		var me = this;
	
		if (me.create) {
			values.type = 'zfs';
				values.content = 'images';
	
		} else {
			delete values.storage;
		}
	
		values.disable = values.enable ? 0 : 1;	    
		delete values.enable;
	
		return values;
    },

    initComponent : function() {
	var me = this;


	me.column1 = [
	    {
			xtype: me.create ? 'textfield' : 'displayfield',
			name: 'storage',
			height: 22, // hack: set same height as text fields
			value: me.storageId || '',
			fieldLabel: 'ID',
			vtype: 'StorageId',
			allowBlank: false
	    },
	    {
			xtype: me.create ? 'textfield' : 'displayfield',
			name: 'portal',
			height: 22, // hack: set same height as text fields
			value: '',
			fieldLabel: gettext('Portal'),
			allowBlank: false
	    },
	    {
			xtype: me.create ? 'textfield' : 'displayfield',
			name: 'pool',
			height: 22, // hack: set same height as text fields
			value: '',
			fieldLabel: gettext('Pool'),
			allowBlank: false
	    },
	    {
			xtype: me.create ? 'textfield' : 'displayfield',
			name: 'blocksize',
			height: 22, // hack: set same height as text fields
			value: '4k',
			fieldLabel: gettext('Block Size'),
			allowBlank: false
	    },
	    {
			xtype: me.create ? 'textfield' : 'displayfield',
			name: 'target',
			height: 22, // hack: set same height as text fields
			value: 'iqn.2010-09.org.openindiana:omnios:....',
			fieldLabel: gettext('Target'),
			allowBlank: false
	    }
	];

	me.column2 = [
	    {
			xtype: 'pvecheckbox',
			name: 'enable',
			checked: true,
			uncheckedValue: 0,
			fieldLabel: gettext('Enable')
	    },
	    {
			xtype: me.create ? 'textfield' : 'displayfield',
			name: 'iscsiprovider',
			height: 22, // hack: set same height as text fields
			value: 'Comstar',
			fieldLabel: gettext('iSCSI Provider'),
			allowBlank: false
	    }
	];

	if (me.create || me.storageId !== 'local') {
	    me.column2.unshift({
		xtype: 'PVE.form.NodeSelector',
		name: 'nodes',
		fieldLabel: gettext('Nodes'),
		emptyText: gettext('All') + ' (' + 
		    gettext('No restrictions') +')',
		multiSelect: true,
		autoSelect: false
	    });
	}

	me.callParent();
    }
});

Ext.define('PVE.storage.ZFSEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;
 
	me.create = !me.storageId;

	if (me.create) {
            me.url = '/api2/extjs/storage';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/storage/' + me.storageId;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.storage.ZFSInputPanel', {
	    create: me.create,
	    storageId: me.storageId
	});

	Ext.apply(me, {
            subject: 'ZFS Storage',
	    isAdd: true,
	    items: [ ipanel ]
	});
	
	me.callParent();

        if (!me.create) {
            me.load({
                success:  function(response, options) {
                    var values = response.result.data;
                    if (values.nodes) {
                        values.nodes = values.nodes.split(',');
                    }
                    values.enable = values.disable ? 0 : 1;
                    ipanel.setValues(values);
                }
            });
        }
    }
});
