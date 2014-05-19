Ext.define('PVE.form.FWMacroSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: 'widget.pveFWMacroSelector',

    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: true,
	    fields: [ 'macro', 'descr' ],
	    idProperty: 'macro',
	    proxy: {
		type: 'pve',
		url: "/api2/json/cluster/firewall/macros"
	    },
	    sorters: {
		property: 'macro',
		order: 'DESC'
	    }
	});

	Ext.apply(me, {
	    store: store,
	    allowBlank: true,
	    autoSelect: false,
	    valueField: 'macro',
	    displayField: 'macro',
            listConfig: {
		columns: [
		    {
			header: gettext('Macro'),
			dataIndex: 'macro',
			hideable: false,
			width: 100
		    },
		    {
			header: gettext('Description'),
			flex: 1,
			dataIndex: 'descr'
		    }
		]
	    }
	});

	me.callParent();
    }
});

Ext.define('PVE.FirewallRulePanel', {
    extend: 'PVE.panel.InputPanel',

    allow_iface: false,

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: 'pveKVComboBox',
		name: 'type',
		value: 'in',
		data: [['in', 'in'], ['out', 'out']],
		fieldLabel: gettext('Direction'),
		allowBlank: false
	    },
	    {
		xtype: 'pveKVComboBox',
		name: 'action',
		value: 'ACCEPT',
		data: [['ACCEPT', 'ACCEPT'], ['DROP', 'DROP'], ['REJECT', 'REJECT']],
		fieldLabel: gettext('Action'),
		allowBlank: false
	    }
        ];

	if (me.allow_iface) {
	    me.column1.push({
		xtype: 'pvetextfield',
		name: 'iface',
		deleteEmpty: !me.create,
		value: '',
		fieldLabel: gettext('Interface')
	    });
	} else {
	    me.column1.push({
		xtype: 'displayfield',
		fieldLabel: '',
		height: 22, // hack: set same height as text fields
		value: ''
	    });
	}

	me.column1.push([
	    {
		xtype: 'displayfield',
		fieldLabel: '',
		height: 7,
		value: ''
	    },
	    {
		xtype: 'pveIPSetSelector',
		name: 'source',
		autoSelect: false,
		editable: true,
		queryDelay: 900000000, // disable query
		value: '',
		fieldLabel: gettext('Source')
	    },
	    {
		xtype: 'pveIPSetSelector',
		name: 'dest',
		autoSelect: false,
		queryDelay: 900000000, // disable query
		editable: true,
		value: '',
		fieldLabel: gettext('Destination')
	    }
	]);

	me.column2 = [
	    {
		xtype: 'pvecheckbox',
		name: 'enable',
		checked: false,
		height: 22, // hack: set same height as text fields
		uncheckedValue: 0,
		fieldLabel: gettext('Enable')
	    },
	    {
		xtype: 'pveFWMacroSelector',
		name: 'macro',
		value: '',
		deleteEmpty: !me.create,
		fieldLabel: gettext('Macro'),
		allowBlank: true,
		listeners: {
		    change: function(f, value) {
                        if (value === '') {
			    me.down('field[name=proto]').setDisabled(false);
			    me.down('field[name=sport]').setDisabled(false);
			    me.down('field[name=dport]').setDisabled(false);
                        } else {
			    me.down('field[name=proto]').setDisabled(true);
			    me.down('field[name=sport]').setDisabled(true);
			    me.down('field[name=dport]').setDisabled(true);
                        }
                    }
                }
	    },
	    {
		xtype: 'pveKVComboBox',
		name: 'proto',
		value: '',
		deleteEmpty: !me.create,
		emptyText: 'any',
		editable: true,
		data: [['tcp', 'TCP'], ['udp', 'UDP'], ['icmp', 'ICMP']],
		fieldLabel: gettext('Protocol'),
		allowBlank: true
	    },
	    {
		xtype: 'displayfield',
		fieldLabel: '',
		height: 7,
		value: ''
	    },
	    {
		xtype: 'textfield',
		name: 'sport',
		value: '',
		fieldLabel: gettext('Source port')
	    },
	    {
		xtype: 'textfield',
		name: 'dport',
		height: 22, // hack: set same height as text fields
		value: '',
		fieldLabel: gettext('Dest. port')
	    }
	];
	
	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		value: '',
		fieldLabel: gettext('Comment')
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.FirewallRuleEdit', {
    extend: 'PVE.window.Edit',

    base_url: undefined,

    allow_iface: false,

    initComponent : function() {
	/*jslint confusion: true */
	var me = this;

	me.create = (me.rule_pos === undefined);

	if (me.create) {
            me.url = '/api2/extjs' + me.base_url;
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs' + me.base_url + '/' + me.rule_pos.toString();
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.FirewallRulePanel', {
	    create: me.create,
	    allow_iface: me.allow_iface,
	    rule_pos: me.rule_pos
	});

	Ext.apply(me, {
            subject: gettext('Rule'),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.create) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;
		    ipanel.setValues(values);
		}
	    });
	}
    }
});

Ext.define('PVE.FirewallGroupRuleEdit', {
    extend: 'PVE.window.Edit',

    base_url: undefined,

    allow_iface: false,

    initComponent : function() {
	/*jslint confusion: true */
	var me = this;

	me.create = (me.rule_pos === undefined);

	if (me.create) {
            me.url = '/api2/extjs' + me.base_url;
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs' + me.base_url + '/' + me.rule_pos.toString();
            me.method = 'PUT';
        }

	var column1 = [
	    {
		xtype: 'hiddenfield',
		name: 'type',
		value: 'group'
	    },
	    {
		xtype: 'pveSecurityGroupsSelector',
		name: 'action',
		value: '',
		fieldLabel: gettext('Security Group'),
		allowBlank: false
	    }
	];

	if (me.allow_iface) {
	    column1.push({
		xtype: 'pvetextfield',
		name: 'iface',
		deleteEmpty: !me.create,
		value: '',
		fieldLabel: gettext('Interface')
	    });
	}

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    create: me.create,
	    column1: column1,
	    column2: [
		{
		    xtype: 'pvecheckbox',
		    name: 'enable',
		    checked: false,
		    height: 22, // hack: set same height as text fields
		    uncheckedValue: 0,
		    fieldLabel: gettext('Enable')
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
            subject: gettext('Rule'),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.create) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;
		    ipanel.setValues(values);
		}
	    });
	}
    }
});

Ext.define('PVE.FirewallRules', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveFirewallRules',

    base_url: undefined,

    addBtn: undefined,
    removeBtn: undefined,
    editBtn: undefined,
    groupBtn: undefined,

    tbar_prefix: undefined,

    allow_groups: true,
    allow_iface: false,

    setBaseUrl: function(url) {
        var me = this;

	me.base_url = url;

	if (url === undefined) {
	    me.addBtn.setDisabled(true);
	    if (me.groupBtn) {
		me.groupBtn.setDisabled(true);
	    }
	    me.store.removeAll();
	} else {
	    me.addBtn.setDisabled(false);
	    if (me.groupBtn) {
		me.groupBtn.setDisabled(false);
	    }
	    me.store.setProxy({
		type: 'pve',
		url: '/api2/json' + url
	    });

	    me.store.load();
	}
    },

    moveRule: function(from, to) {
        var me = this;

	if (!me.base_url) { 
	    return;
	}

	PVE.Utils.API2Request({
	    url: me.base_url + "/" + from,
	    method: 'PUT',
	    params: { moveto: to },
	    waitMsgTarget: me,
	    failure: function(response, options) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    callback: function() {
		me.store.load();
	    }
	});
    },

    createRule: function(editor, rule) {
        var me = this;

	if (!me.base_url) {
	    return;
	}

	rule.pos = 0;

	rule.enable = rule.enable ? 1 : 0;

	PVE.Utils.API2Request({
	    url: me.base_url,
	    method: 'POST',
	    params: rule,
	    waitMsgTarget: me,
	    failure: function(response, options) {
		if (editor) {
		    editor.form.markInvalid(response.result.errors);
		} else {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    },
	    callback: function() {
		me.store.load();
	    }
	});
    },

    updateRule: function(editor, rule) {
        var me = this;

	if (!me.base_url) { 
	    return;
	}

	rule.enable = rule.enable ? 1 : 0;

	var pos = rule.pos;
	delete rule.pos;

	PVE.Utils.API2Request({
	    url: me.base_url + '/' + pos.toString(),
	    method: 'PUT',
	    params: rule,
	    waitMsgTarget: me,
	    failure: function(response, options) {
		if (editor) {
		    editor.form.markInvalid(response.result.errors);
		} else {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    },
	    callback: function() {
		me.store.load();
	    }
	});
    },

    deleteRule: function(rule) {
        var me = this;

	if (!me.base_url) {
	    return;
	}

	PVE.Utils.API2Request({
	    url: me.base_url + '/' + rule.pos.toString() +
		'?digest=' + encodeURIComponent(rule.digest),
	    method: 'DELETE',
	    waitMsgTarget: me,
	    failure: function(response, options) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    callback: function() {
		me.store.load();
	    }
	});
    },

    initComponent: function() {
	/*jslint confusion: true */
        var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-fw-rule'
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
	    var type = rec.data.type;

	    var editor;
	    if (type === 'in' || type === 'out') {
		editor = 'PVE.FirewallRuleEdit';
	    } else if (type === 'group') {
		editor = 'PVE.FirewallGroupRuleEdit';
	    } else {
		return;
	    }

	    var win = Ext.create(editor, {
		digest: rec.data.digest,
		allow_iface: me.allow_iface,
		base_url: me.base_url,
		rule_pos: rec.data.pos
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
	    disabled: true,
	    handler: function() {
		var win = Ext.create('PVE.FirewallRuleEdit', {
		    allow_iface: me.allow_iface,
		    base_url: me.base_url
		});
		win.on('destroy', reload);
		win.show();
	    }
	});

	if (me.allow_groups) {
	    me.groupBtn =  Ext.create('Ext.Button', {
		text: gettext('Insert') + ': ' + gettext('Security Group'),
		disabled: true,
		handler: function() {
		    var win = Ext.create('PVE.FirewallGroupRuleEdit', {
			allow_iface: me.allow_iface,
			base_url: me.base_url
		    });
		    win.on('destroy', reload);
		    win.show();
		}
	    });
	}

	me.removeBtn = new PVE.button.Button({
	    text: gettext('Remove'),
	    selModel: sm,
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}
		me.deleteRule(rec.data);
	    }
	});

	var tbar = me.tbar_prefix ? [ me.tbar_prefix ] : [];
	tbar.push(me.addBtn);
	if (me.groupBtn) {
	    tbar.push(me.groupBtn);
	}
	tbar.push([ me.removeBtn, me.editBtn ]);

	var columns = [
	    {
		// similar to xtype: 'rownumberer',
		dataIndex: 'pos',
		resizable: false,
		width: 23,
		sortable: false,
		align: 'right',
		hideable: false,
		menuDisabled: true,
		renderer: function(value, metaData, record, rowIdx, colIdx, store) {
		    metaData.tdCls = Ext.baseCSSPrefix + 'grid-cell-special';
		    if (value >= 0) {
			return value;
		    }
		    return '';
		}
	    },
	    {
		xtype: 'checkcolumn',
		header: gettext('Enable'),
		dataIndex: 'enable',
		listeners: {
		    checkchange: function(column, record, checked) {
			record.commit();
			var data = {};
			record.fields.each(function(field) {
			    data[field.name] = record.get(field.name);
			});
			if (!me.allow_iface || !data.iface) {
			    delete data.iface;
			}
			me.updateRule(undefined, data);
		    }
		},
		width: 50
	    },
	    {
		header: gettext('Type'),
		dataIndex: 'type',
		width: 50
	    },
	    {
		header: gettext('Action'),
		dataIndex: 'action',
		width: 80
	    },
	    {
		header: gettext('Macro'),
		dataIndex: 'macro',
		width: 80
	    }
	];

	if (me.allow_iface) {
	    columns.push({
		header: gettext('Interface'),
		dataIndex: 'iface',
		width: 80
	    });
	}

	columns.push([
	    {
		header: gettext('Source'),
		dataIndex: 'source',
		width: 100
	    },
	    {
		header: gettext('Destination'),
		dataIndex: 'dest',
		width: 100
	    },
	    {
		header: gettext('Protocol'),
		dataIndex: 'proto',
		width: 100
	    },
	    {
		header: gettext('Dest. port'),
		dataIndex: 'dport',
		width: 100
	    },
	    {
		header: gettext('Source port'),
		dataIndex: 'sport',
		width: 100
	    },
	    {
		header: gettext('Comment'),
		dataIndex: 'comment',
		flex: 1,
		renderer: function(value) {
		    return Ext.util.Format.htmlEncode(value);
		}
	    }
	]);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: tbar,
            viewConfig: {
		plugins: [
		    {
			ptype: 'gridviewdragdrop',
			dragGroup: 'FWRuleDDGroup',
			dropGroup: 'FWRuleDDGroup'
		    }
		],
		listeners: {
                    beforedrop: function(node, data, dropRec, dropPosition) {
			if (!dropRec) {
			    return false; // empty view
			}
			var moveto = dropRec.get('pos');
			if (dropPosition === 'after') {
			    moveto++;
			}
			var pos = data.records[0].get('pos');
			me.moveRule(pos, moveto);
			return 0;
                    },
		    itemdblclick: run_editor
		}
	    },
	    columns: columns
	});

	me.callParent();

	if (me.base_url) {
	    me.setBaseUrl(me.base_url); // load
	}
    }
}, function() {

    Ext.define('pve-fw-rule', {
	extend: 'Ext.data.Model',
	fields: [ { name: 'enable', type: 'boolean' },
		  'type', 'action', 'macro', 'source', 'dest', 'proto', 'iface',
		  'dport', 'sport', 'comment', 'pos', 'digest' ],
	idProperty: 'pos'
    });

});
