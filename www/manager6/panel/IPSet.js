Ext.define('PVE.IPSetList', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveIPSetList',

    stateful: true,
    stateId: 'grid-firewall-ipsetlist',

    ipset_panel: undefined,

    base_url: undefined,

    addBtn: undefined,
    removeBtn: undefined,
    editBtn: undefined,

    initComponent: function() {

        var me = this;

	if (me.ipset_panel == undefined) {
	    throw "no rule panel specified";
	}

	if (me.base_url == undefined) {
	    throw "no base_url specified";
	}

	var store = new Ext.data.Store({
	    fields: [ 'name', 'comment', 'digest' ],
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
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }
	    var win = Ext.create('PVE.window.Edit', {
		subject: "IPSet '" + rec.data.name + "'",
		url: me.base_url,
		method: 'POST',
		digest: rec.data.digest,
		items: [
		    {
			xtype: 'hiddenfield',
			name: 'rename',
			value: rec.data.name
		    },
		    {
			xtype: 'textfield',
			name: 'name',
			value: rec.data.name,
			fieldLabel: gettext('Name'),
			allowBlank: false
		    },
		    {
			xtype: 'textfield',
			name: 'comment',
			value: rec.data.comment,
			fieldLabel: gettext('Comment')
		    }
		]
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
		var win = Ext.create('PVE.window.Edit', {
		    subject: 'IPSet',
		    url: me.base_url,
		    method: 'POST',
		    items: [
			{
			    xtype: 'textfield',
			    name: 'name',
			    value: '',
			    fieldLabel: gettext('Name'),
			    allowBlank: false
			},
			{
			    xtype: 'textfield',
			    name: 'comment',
			    value: '',
			    fieldLabel: gettext('Comment')
			}
		    ]
		});
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

	Ext.apply(me, {
	    store: store,
	    tbar: [ '<b>IPSet:</b>', me.addBtn, me.removeBtn, me.editBtn ],
	    selModel: sm,
	    columns: [
		{ header: 'IPSet', dataIndex: 'name', width: '100' },
		{ header: gettext('Comment'), dataIndex: 'comment', renderer: Ext.String.htmlEncode, flex: 1 }
	    ],
	    listeners: {
		itemdblclick: run_editor,
		select: function(sm, rec) {
		    var url = me.base_url + '/' + rec.data.name;
		    me.ipset_panel.setBaseUrl(url);
		},
		deselect: function() {
		    me.ipset_panel.setBaseUrl(undefined);
		},
		show: reload
	    }
	});

	me.callParent();

	store.load();
    }
});

Ext.define('PVE.IPSetCidrEdit', {
    extend: 'PVE.window.Edit',

    cidr: undefined,

    initComponent : function() {

	var me = this;

	me.isCreate = (me.cidr === undefined);


	if (me.isCreate) {
            me.url = '/api2/extjs' + me.base_url;
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs' + me.base_url + '/' + me.cidr;
            me.method = 'PUT';
        }

	var column1 = [];

	if (me.isCreate) {
	    if (!me.list_refs_url) {
		throw "no alias_base_url specified";
	    }

	    column1.push({
		xtype: 'pveIPRefSelector',
		name: 'cidr',
		ref_type: 'alias',
		autoSelect: false,
		editable: true,
		base_url: me.list_refs_url,
		value: '',
		fieldLabel: gettext('IP/CIDR')
	    });
	} else {
	    column1.push({
		xtype: 'displayfield',
		name: 'cidr',
		value: '',
		fieldLabel: gettext('IP/CIDR')
	    });
	}

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    isCreate: me.isCreate,
	    column1: column1,
	    column2: [
		{
		    xtype: 'pvecheckbox',
		    name: 'nomatch',
		    checked: false,
		    uncheckedValue: 0,
		    fieldLabel: 'nomatch'
		}
	    ],
	    columnB: [
		{
		    xtype: 'textfield',
		    name: 'comment',
		    value: '',
		    fieldLabel: gettext('Comment')
		}
	    ]
	});

	Ext.apply(me, {
	    subject: gettext('IP/CIDR'),
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;
		    ipanel.setValues(values);
		}
	    });
	}
    }
});

Ext.define('PVE.IPSetGrid', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveIPSetGrid',

    stateful: true,
    stateId: 'grid-firewall-ipsets',

    base_url: undefined,
    list_refs_url: undefined,

    addBtn: undefined,
    removeBtn: undefined,
    editBtn: undefined,

    setBaseUrl: function(url) {
        var me = this;

	me.base_url = url;

	if (url === undefined) {
	    me.addBtn.setDisabled(true);
	    me.store.removeAll();
	} else {
	    me.addBtn.setDisabled(false);
	    me.store.setProxy({
		type: 'pve',
		url: '/api2/json' + url
	    });

	    me.store.load();
	}
    },

    initComponent: function() {
	/*jslint confusion: true */
        var me = this;

	if (!me.list_refs_url) {
	    throw "no1 list_refs_url specified";
	}

	var store = new Ext.data.Store({
	    model: 'pve-ipset'
	});

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }
	    var win = Ext.create('PVE.IPSetCidrEdit', {
		base_url: me.base_url,
		cidr: rec.data.cidr
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
	    text: gettext('Add'),
	    disabled: true,
	    handler: function() {
		if (!me.base_url) {
		    return;
		}
		var win = Ext.create('PVE.IPSetCidrEdit', {
		    base_url: me.base_url,
		    list_refs_url: me.list_refs_url
		});
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
		    url: me.base_url + '/' + rec.data.cidr,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, options) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    callback: reload
		});
	    }
	});

	var render_errors = function(value, metaData, record) {
	    var errors = record.data.errors;
	    if (errors) {
		var msg = errors.cidr || errors.nomatch;
		if (msg) {
		    metaData.tdCls = 'pve-invalid-row';
		    var html = '<p>' +  Ext.htmlEncode(msg) + '</p>';
		    metaData.tdAttr = 'data-qwidth=600 data-qtitle="ERROR" data-qtip="' + 
			html.replace(/\"/g,'&quot;') + '"';
		}
	    }
	    return value;
	};

	Ext.apply(me, {
	    tbar: [ '<b>IP/CIDR:</b>', me.addBtn, me.removeBtn, me.editBtn ],
	    store: store,
	    selModel: sm,
	    listeners: {
		itemdblclick: run_editor
	    },
	    columns: [
		{
		    xtype: 'rownumberer'
		},
		{
		    header: gettext('IP/CIDR'),
		    dataIndex: 'cidr',
		    width: 150,
		    renderer: function(value, metaData, record) {
			value = render_errors(value, metaData, record);
			if (record.data.nomatch) {
			    return '<b>! </b>' + value;
			}
			return value;
		    }
		},
		{
		    header: gettext('Comment'),
		    dataIndex: 'comment',
		    flex: 1,
		    renderer: function(value) {
			return Ext.util.Format.htmlEncode(value);
		    }
		}
	    ]
	});

	me.callParent();

	if (me.base_url) {
	    me.setBaseUrl(me.base_url); // load
	}
    }
}, function() {

    Ext.define('pve-ipset', {
	extend: 'Ext.data.Model',
	fields: [ { name: 'nomatch', type: 'boolean' },
		  'cidr', 'comment', 'errors' ],
	idProperty: 'cidr'
    });

});

Ext.define('PVE.IPSet', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveIPSet',

    title: 'IPSet',

    onlineHelp: 'pve_firewall_ip_sets',

    list_refs_url: undefined,

    initComponent: function() {
	var me = this;

	if (!me.list_refs_url) {
	    throw "no list_refs_url specified";
	}

	var ipset_panel = Ext.createWidget('pveIPSetGrid', {
	    region: 'center',
	    list_refs_url: me.list_refs_url,
	    border: false
	});

	var ipset_list = Ext.createWidget('pveIPSetList', {
	    region: 'west',
	    ipset_panel: ipset_panel,
	    base_url: me.base_url,
	    width: '50%',
	    border: false,
	    split: true
	});

	Ext.apply(me, {
            layout: 'border',
            items: [ ipset_list, ipset_panel ],
	    listeners: {
		show: function() {
		    ipset_list.fireEvent('show', ipset_list);
		}
	    }
	});

	me.callParent();
    }
});
