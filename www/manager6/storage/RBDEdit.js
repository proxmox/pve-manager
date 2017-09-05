Ext.define('PVE.storage.RBDInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'rbd';
	} else {
	    delete values.storage;
	}

	values.disable = values.enable ? 0 : 1;
	delete values.enable;

	return values;
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'storage',
		value: me.storageId || '',
		fieldLabel: 'ID',
		vtype: 'StorageId',
		allowBlank: false
	    }
	];

	if (me.pveceph) {
	    me.column1.push(
		{
		    xtype: me.isCreate ? 'pveCephPoolSelector' : 'displayfield',
		    nodename: me.nodename,
		    name: 'pool',
		    fieldLabel: gettext('Pool'),
		    allowBlank: false
		}
	    );
	} else {
	    me.column1.push(
		{
		    xtype: me.isCreate ? 'textfield' : 'displayfield',
		    name: 'pool',
		    value: 'rbd',
		    fieldLabel: gettext('Pool'),
		    allowBlank: false
		},
		{
		    xtype: me.isCreate ? 'textfield' : 'displayfield',
		    name: 'monhost',
		    vtype: 'HostList',
		    value: '',
		    fieldLabel: 'Monitor(s)',
		    allowBlank: false
		},
		{
		    xtype: me.isCreate ? 'textfield' : 'displayfield',
		    name: 'username',
		    value: me.isCreate ? 'admin': '',
		    fieldLabel: gettext('User name'),
		    allowBlank: true
		}
	    );
	}

	// here value is an array,
	// while before it was a string
	/*jslint confusion: true*/
	me.column2 = [
	    {
		xtype: 'pvecheckbox',
		name: 'enable',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('Enable')
	    },
	    {
		xtype: 'pveContentTypeSelector',
		cts: ['images', 'rootdir'],
		fieldLabel: gettext('Content'),
		name: 'content',
		value: ['images'],
		multiSelect: true,
		allowBlank: false
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'krbd',
		uncheckedValue: 0,
		fieldLabel: 'KRBD'
	    }
	];
	/*jslint confusion: false*/

	if (me.isCreate) {
	    me.column2.unshift({
		xtype: 'pveNodeSelector',
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

Ext.define('PVE.storage.RBDEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	me.isCreate = !me.storageId;

	if (me.isCreate) {
            me.url = '/api2/extjs/storage';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/storage/' + me.storageId;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.storage.RBDInputPanel', {
	    isCreate: me.isCreate,
	    storageId: me.storageId,
	    nodename: me.nodename,
	    pveceph: me.pveceph
	});

	Ext.apply(me, {
	    subject: PVE.Utils.format_storage_type(me.pveceph?'pveceph':'rbd'),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

        if (!me.isCreate) {
            me.load({
                success:  function(response, options) {
                    var values = response.result.data;

		    var ctypes = values.content || '';

		    values.content = ctypes.split(',');

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
