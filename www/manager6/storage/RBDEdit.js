Ext.define('PVE.storage.RBDInputPanel', {
    extend: 'PVE.panel.StorageBase',

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}
	me.type = 'rbd';

	me.column1 = [];

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
		xtype: 'pveContentTypeSelector',
		cts: ['images', 'rootdir'],
		fieldLabel: gettext('Content'),
		name: 'content',
		value: ['images'],
		multiSelect: true,
		allowBlank: false
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'krbd',
		uncheckedValue: 0,
		fieldLabel: 'KRBD'
	    }
	];
	/*jslint confusion: false*/

	me.callParent();
    }
});

Ext.define('PVE.storage.PVERBDInputPanel', {
    extend: 'PVE.storage.RBDInputPanel',

    pveceph: 1
});
