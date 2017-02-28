Ext.define('PVE.SecurityGroupEdit', {
    extend: 'PVE.window.Edit',

    base_url: "/cluster/firewall/groups",

    allow_iface: false,

    initComponent : function() {
	var me = this;

	me.isCreate = (me.group_name === undefined);

	var subject;

        me.url = '/api2/extjs' + me.base_url;
        me.method = 'POST';
	
	var items = [	    
	    {
		xtype: 'textfield',
		name: 'group',
		value: me.group_name || '',
		fieldLabel: gettext('Name'),
		allowBlank: false
	    },
	    {
		xtype: 'textfield',
		name: 'comment',
		value: me.group_comment || '',
		fieldLabel: gettext('Comment')
	    }
	];

	if (me.isCreate) {
	    subject = gettext('Security Group');
        } else {
	    subject = gettext('Security Group') + " '" + me.group_name + "'";
	    items.push({
		xtype: 'hiddenfield',
		name: 'rename',
		value: me.group_name
	    });
        }

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	// InputPanel does not have a 'create' property, does it need a 'isCreate'
	    isCreate: me.isCreate,
	    items: items 
	});


	Ext.apply(me, {
            subject: subject,
	    items: [ ipanel ]
	});

	me.callParent();
    }
});

Ext.define('PVE.SecurityGroupList', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveSecurityGroupList',

    stateful: true,
    stateId: 'grid-securitygroups',

    rule_panel: undefined,

    addBtn: undefined,
    removeBtn: undefined,
    editBtn: undefined,

    base_url: "/cluster/firewall/groups",

    initComponent: function() {
	/*jslint confusion: true */
        var me = this;

	if (me.rule_panel == undefined) {
	    throw "no rule panel specified";
	}

	if (me.base_url == undefined) {
	    throw "no base_url specified";
	}

	var store = new Ext.data.Store({
	    fields: [ 'group', 'comment', 'digest' ],
	    proxy: {
		type: 'pve',
		url: '/api2/json' + me.base_url
	    },
	    idProperty: 'group',
	    sorters: {
		property: 'group',
		order: 'DESC'
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    var oldrec = sm.getSelection()[0];
	    store.load(function(records, operation, success) {
		if (oldrec) {
		    var rec = store.findRecord('group', oldrec.data.group);
		    if (rec) {
			sm.select(rec);
		    }
		}
	    });
	};

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }
	    var win = Ext.create('PVE.SecurityGroupEdit', {
		digest: rec.data.digest,
		group_name: rec.data.group,
		group_comment: rec.data.comment
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

	me.addBtn = new PVE.button.Button({
	    text: gettext('Create'),
	    handler: function() {
		sm.deselectAll();
		var win = Ext.create('PVE.SecurityGroupEdit', {});
		win.show();
		win.on('destroy', reload);
	    }
	});

	me.removeBtn = new PVE.button.Button({
	    text: gettext('Remove'),
	    selModel: sm,
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];
		if (!rec || !me.base_url) {
		    return;
		}
		PVE.Utils.API2Request({
		    url: me.base_url + '/' + rec.data.group,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, options) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    callback: reload
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    tbar: [ '<b>' + gettext('Group') + ':</b>', me.addBtn, me.removeBtn, me.editBtn ],
	    selModel: sm,
	    columns: [
		{ header: gettext('Group'), dataIndex: 'group', width: '100' },
		{ header: gettext('Comment'), dataIndex: 'comment', renderer: Ext.String.htmlEncode, flex: 1 }
	    ],
	    listeners: {
		itemdblclick: run_editor,
		select: function(sm, rec) {
		    var url = '/cluster/firewall/groups/' + rec.data.group;
		    me.rule_panel.setBaseUrl(url);
		},
		deselect: function() {
		    me.rule_panel.setBaseUrl(undefined);
		},
		show: reload
	    }
	});

	me.callParent();

	store.load();
    }
});

Ext.define('PVE.SecurityGroups', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveSecurityGroups',

    title: 'Security Groups',

    initComponent: function() {
	var me = this;

	var rule_panel = Ext.createWidget('pveFirewallRules', {
	    region: 'center',
	    allow_groups: false,
	    list_refs_url: '/cluster/firewall/refs',
	    tbar_prefix: '<b>' + gettext('Rules') + ':</b>',
	    border: false
	});

	var sglist = Ext.createWidget('pveSecurityGroupList', {
	    region: 'west',
	    rule_panel: rule_panel,
	    width: '25%',
	    border: false,
	    split: true
	});


	Ext.apply(me, {
            layout: 'border',
            items: [ sglist, rule_panel ],
	    listeners: {
		show: function() {
		    sglist.fireEvent('show', sglist);
		}
	    }
	});

	me.callParent();
    }
});
