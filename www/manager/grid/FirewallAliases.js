Ext.define('PVE.FirewallAliasEdit', {
    extend: 'PVE.window.Edit',

    base_url: undefined,
    
    alias_name: undefined,

    initComponent : function() {
	/*jslint confusion: true */
	var me = this;

	me.create = (me.alias_name === undefined);

	if (me.create) {
            me.url = '/api2/extjs' + me.base_url;
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs' + me.base_url + '/' + me.alias_name;
            me.method = 'PUT';
        }

	var items =  [
	    {
		xtype: 'textfield',
		name: me.create ? 'name' : 'rename',
		fieldLabel: gettext('Name'),
		allowBlank: false
	    },
	    {
		xtype: 'textfield',
		name: 'cidr',
		fieldLabel: gettext('IP/CIDR'),
		allowBlank: false
	    },
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
	    }
	];

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    create: me.create,
	    items: items
	});

	Ext.apply(me, {
            subject: gettext('Alias'),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.create) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;
		    values.rename = values.name;
		    ipanel.setValues(values);
		}
	    });
	}
    }
});

Ext.define('PVE.FirewallAliases', {
    extend: 'Ext.grid.Panel',
    alias: ['widget.pveFirewallAliases'],

    base_url: undefined,

    title: gettext('Alias'),

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	if (!me.base_url) {
	    throw "missing base_url configuration";
	}

	var store = new Ext.data.Store({
	    fields: [ 'name', 'cidr', 'comment', 'digest' ],
	    proxy: {
		type: 'pve',
		url: "/api2/json" + me.base_url
	    },
	    idProperty: 'name',
	    sorters: {
		property: 'name',
		order: 'DESC'
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    var oldrec = sm.getSelection()[0];
	    store.load(function(records, operation, success) {
		if (oldrec) {
		    var rec = store.findRecord('name', oldrec.data.name);
		    if (rec) {
			sm.select(rec);
		    }
		}
	    });
	};

	var run_editor = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.FirewallAliasEdit', {
		base_url: me.base_url,
		alias_name: rec.data.name
	    });

	    win.show();
	    win.on('destroy', reload);
	};

	me.editBtn = new PVE.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

	me.addBtn =  Ext.create('Ext.Button', {
	    text: gettext('Add'),
	    handler: function() {
		var win = Ext.create('PVE.FirewallAliasEdit', {
		    base_url: me.base_url
		});
		win.on('destroy', reload);
		win.show();
	    }
	});

	me.removeBtn = new PVE.button.Button({
	    text: gettext('Remove'),
	    selModel: sm,
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}
		PVE.Utils.API2Request({
		    url: me.base_url + '/' + rec.data.name,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, options) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    callback: reload
		});
	    }
	});


	Ext.applyIf(me, {
	    store: store,
	    tbar: [ me.addBtn, me.removeBtn, me.editBtn ],
	    selModel: sm,
	    columns: [
		{ header: gettext('Name'), dataIndex: 'name', width: 100 },
		{ header:  gettext('IP/CIDR'), dataIndex: 'cidr', width: 100 },
		{ header: gettext('Comment'), dataIndex: 'comment', renderer: Ext.String.htmlEncode, flex: 1 }
	    ],
	    listeners: {
		itemdblclick: run_editor
	    }
	});

	me.callParent();

	me.on('show', reload);
    }
});
