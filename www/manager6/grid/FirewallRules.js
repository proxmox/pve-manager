Ext.define('PVE.form.FWMacroSelector', {
    extend: 'Proxmox.form.ComboGrid',
    alias: 'widget.pveFWMacroSelector',
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
		width: 100,
	    },
	    {
		header: gettext('Description'),
		renderer: Ext.String.htmlEncode,
		flex: 1,
		dataIndex: 'descr',
	    },
	],
    },
    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: true,
	    fields: ['macro', 'descr'],
	    idProperty: 'macro',
	    proxy: {
		type: 'proxmox',
		url: "/api2/json/cluster/firewall/macros",
	    },
	    sorters: {
		property: 'macro',
		order: 'DESC',
	    },
	});

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    },
});

Ext.define('PVE.FirewallRulePanel', {
    extend: 'Proxmox.panel.InputPanel',

    allow_iface: false,

    list_refs_url: undefined,

    onGetValues: function(values) {
	var me = this;

	// hack: editable ComboGrid returns nothing when empty, so we need to set ''
	// Also, disabled text fields return nothing, so we need to set ''

	Ext.Array.each(['source', 'dest', 'macro', 'proto', 'sport', 'dport', 'log'], function(key) {
	    if (values[key] === undefined) {
		values[key] = '';
	    }
	});

	delete values.modified_marker;

	return values;
    },

    initComponent: function() {
	var me = this;

	if (!me.list_refs_url) {
	    throw "no list_refs_url specified";
	}

	me.column1 = [
	    {
		// hack: we use this field to mark the form 'dirty' when the
		// record has errors- so that the user can safe the unmodified
		// form again.
		xtype: 'hiddenfield',
		name: 'modified_marker',
		value: '',
	    },
	    {
		xtype: 'proxmoxKVComboBox',
		name: 'type',
		value: 'in',
		comboItems: [['in', 'in'], ['out', 'out']],
		fieldLabel: gettext('Direction'),
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxKVComboBox',
		name: 'action',
		value: 'ACCEPT',
		comboItems: [['ACCEPT', 'ACCEPT'], ['DROP', 'DROP'], ['REJECT', 'REJECT']],
		fieldLabel: gettext('Action'),
		allowBlank: false,
	    },
        ];

	if (me.allow_iface) {
	    me.column1.push({
		xtype: 'proxmoxtextfield',
		name: 'iface',
		deleteEmpty: !me.isCreate,
		value: '',
		fieldLabel: gettext('Interface'),
	    });
	} else {
	    me.column1.push({
		xtype: 'displayfield',
		fieldLabel: '',
		value: '',
	    });
	}

	me.column1.push(
	    {
		xtype: 'displayfield',
		fieldLabel: '',
		height: 7,
		value: '',
	    },
	    {
		xtype: 'pveIPRefSelector',
		name: 'source',
		autoSelect: false,
		editable: true,
		base_url: me.list_refs_url,
		value: '',
		fieldLabel: gettext('Source'),

	    },
	    {
		xtype: 'pveIPRefSelector',
		name: 'dest',
		autoSelect: false,
		editable: true,
		base_url: me.list_refs_url,
		value: '',
		fieldLabel: gettext('Destination'),
	    },
	);


	me.column2 = [
	    {
		xtype: 'proxmoxcheckbox',
		name: 'enable',
		checked: false,
		uncheckedValue: 0,
		fieldLabel: gettext('Enable'),
	    },
	    {
		xtype: 'pveFWMacroSelector',
		name: 'macro',
		fieldLabel: gettext('Macro'),
		editable: true,
		allowBlank: true,
		listeners: {
		    change: function(f, value) {
                        if (value === null) {
			    me.down('field[name=proto]').setDisabled(false);
			    me.down('field[name=sport]').setDisabled(false);
			    me.down('field[name=dport]').setDisabled(false);
                        } else {
			    me.down('field[name=proto]').setDisabled(true);
			    me.down('field[name=proto]').setValue('');
			    me.down('field[name=sport]').setDisabled(true);
			    me.down('field[name=sport]').setValue('');
			    me.down('field[name=dport]').setDisabled(true);
			    me.down('field[name=dport]').setValue('');
                       }
                    },
                },
	    },
	    {
		xtype: 'pveIPProtocolSelector',
		name: 'proto',
		autoSelect: false,
		editable: true,
		value: '',
		fieldLabel: gettext('Protocol'),
	    },
	    {
		xtype: 'displayfield',
		fieldLabel: '',
		height: 7,
		value: '',
	    },
	    {
		xtype: 'textfield',
		name: 'sport',
		value: '',
		fieldLabel: gettext('Source port'),
	    },
	    {
		xtype: 'textfield',
		name: 'dport',
		value: '',
		fieldLabel: gettext('Dest. port'),
	    },
	];

	me.advancedColumn1 = [
	    {
		xtype: 'pveFirewallLogLevels',
	    },
	];

	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		value: '',
		fieldLabel: gettext('Comment'),
	    },
	];

	me.callParent();
    },
});

Ext.define('PVE.FirewallRuleEdit', {
    extend: 'Proxmox.window.Edit',

    base_url: undefined,
    list_refs_url: undefined,

    allow_iface: false,

    initComponent: function() {
	var me = this;

	if (!me.base_url) {
	    throw "no base_url specified";
	}
	if (!me.list_refs_url) {
	    throw "no list_refs_url specified";
	}

	me.isCreate = me.rule_pos === undefined;

	if (me.isCreate) {
            me.url = '/api2/extjs' + me.base_url;
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs' + me.base_url + '/' + me.rule_pos.toString();
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.FirewallRulePanel', {
	    isCreate: me.isCreate,
	    list_refs_url: me.list_refs_url,
	    allow_iface: me.allow_iface,
	    rule_pos: me.rule_pos,
	});

	Ext.apply(me, {
            subject: gettext('Rule'),
	    isAdd: true,
	    items: [ipanel],
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success: function(response, options) {
		    var values = response.result.data;
		    ipanel.setValues(values);
		    if (values.errors) {
			var field = me.query('[isFormField][name=modified_marker]')[0];
			field.setValue(1);
			Ext.Function.defer(function() {
			    var form = ipanel.up('form').getForm();
			    form.markInvalid(values.errors);
			}, 100);
		    }
		},
	    });
	} else if (me.rec) {
	    ipanel.setValues(me.rec.data);
	}
    },
});

Ext.define('PVE.FirewallGroupRuleEdit', {
    extend: 'Proxmox.window.Edit',

    base_url: undefined,

    allow_iface: false,

    initComponent: function() {
	var me = this;

	me.isCreate = me.rule_pos === undefined;

	if (me.isCreate) {
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
		value: 'group',
	    },
	    {
		xtype: 'pveSecurityGroupsSelector',
		name: 'action',
		value: '',
		fieldLabel: gettext('Security Group'),
		allowBlank: false,
	    },
	];

	if (me.allow_iface) {
	    column1.push({
		xtype: 'proxmoxtextfield',
		name: 'iface',
		deleteEmpty: !me.isCreate,
		value: '',
		fieldLabel: gettext('Interface'),
	    });
	}

	var ipanel = Ext.create('Proxmox.panel.InputPanel', {
	    isCreate: me.isCreate,
	    column1: column1,
	    column2: [
		{
		    xtype: 'proxmoxcheckbox',
		    name: 'enable',
		    checked: false,
		    uncheckedValue: 0,
		    fieldLabel: gettext('Enable'),
		},
	    ],
	    columnB: [
		{
		    xtype: 'textfield',
		    name: 'comment',
		    value: '',
		    fieldLabel: gettext('Comment'),
		},
	    ],
	});

	Ext.apply(me, {
            subject: gettext('Rule'),
	    isAdd: true,
	    items: [ipanel],
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success: function(response, options) {
		    var values = response.result.data;
		    ipanel.setValues(values);
		},
	    });
	}
    },
});

Ext.define('PVE.FirewallRules', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveFirewallRules',

    onlineHelp: 'chapter_pve_firewall',

    stateful: true,
    stateId: 'grid-firewall-rules',

    base_url: undefined,
    list_refs_url: undefined,

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
	    me.removeBtn.baseurl = url + '/';
	    if (me.groupBtn) {
		me.groupBtn.setDisabled(false);
	    }
	    me.store.setProxy({
		type: 'proxmox',
		url: '/api2/json' + url,
	    });

	    me.store.load();
	}
    },

    moveRule: function(from, to) {
        var me = this;

	if (!me.base_url) {
	    return;
	}

	Proxmox.Utils.API2Request({
	    url: me.base_url + "/" + from,
	    method: 'PUT',
	    params: { moveto: to },
	    waitMsgTarget: me,
	    failure: function(response, options) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    callback: function() {
		me.store.load();
	    },
	});
    },

    updateRule: function(rule) {
        var me = this;

	if (!me.base_url) {
	    return;
	}

	rule.enable = rule.enable ? 1 : 0;

	var pos = rule.pos;
	delete rule.pos;
	delete rule.errors;

	Proxmox.Utils.API2Request({
	    url: me.base_url + '/' + pos.toString(),
	    method: 'PUT',
	    params: rule,
	    waitMsgTarget: me,
	    failure: function(response, options) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    callback: function() {
		me.store.load();
	    },
	});
    },


    initComponent: function() {
        var me = this;

	if (!me.list_refs_url) {
	    throw "no list_refs_url specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    model: 'pve-fw-rule',
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
		list_refs_url: me.list_refs_url,
		rule_pos: rec.data.pos,
	    });

	    win.show();
	    win.on('destroy', reload);
	};

	me.editBtn = Ext.create('Proxmox.button.Button', {
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor,
	});

	me.addBtn = Ext.create('Ext.Button', {
	    text: gettext('Add'),
	    disabled: true,
	    handler: function() {
		var win = Ext.create('PVE.FirewallRuleEdit', {
		    allow_iface: me.allow_iface,
		    base_url: me.base_url,
		    list_refs_url: me.list_refs_url,
		});
		win.on('destroy', reload);
		win.show();
	    },
	});

	var run_copy_editor = function() {
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		return;
	    }
	    var type = rec.data.type;


	    if (!(type === 'in' || type === 'out')) {
		return;
	    }

	    var win = Ext.create('PVE.FirewallRuleEdit', {
		allow_iface: me.allow_iface,
		base_url: me.base_url,
		list_refs_url: me.list_refs_url,
		rec: rec,
	    });

	    win.show();
	    win.on('destroy', reload);
	};

	me.copyBtn = Ext.create('Proxmox.button.Button', {
	    text: gettext('Copy'),
	    selModel: sm,
	    enableFn: function(rec) {
		return rec.data.type === 'in' || rec.data.type === 'out';
	    },
	    disabled: true,
	    handler: run_copy_editor,
	});

	if (me.allow_groups) {
	    me.groupBtn = Ext.create('Ext.Button', {
		text: gettext('Insert') + ': ' +
		    gettext('Security Group'),
		disabled: true,
		handler: function() {
		    var win = Ext.create('PVE.FirewallGroupRuleEdit', {
			allow_iface: me.allow_iface,
			base_url: me.base_url,
		    });
		    win.on('destroy', reload);
		    win.show();
		},
	    });
	}

	me.removeBtn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: me.base_url + '/',
	    confirmMsg: false,
	    getRecordName: function(rec) {
		var rule = rec.data;
		return rule.pos.toString() +
		    '?digest=' + encodeURIComponent(rule.digest);
	    },
	    callback: function() {
		me.store.load();
	    },
	});

	var tbar = me.tbar_prefix ? [me.tbar_prefix] : [];
	tbar.push(me.addBtn, me.copyBtn);
	if (me.groupBtn) {
	    tbar.push(me.groupBtn);
	}
	tbar.push(me.removeBtn, me.editBtn);

	var render_errors = function(name, value, metaData, record) {
	    var errors = record.data.errors;
	    if (errors && errors[name]) {
		metaData.tdCls = 'proxmox-invalid-row';
		var html = '<p>' + Ext.htmlEncode(errors[name]) + '</p>';
		metaData.tdAttr = 'data-qwidth=600 data-qtitle="ERROR" data-qtip="' +
		    html.replace(/\"/g, '&quot;') + '"';
	    }
	    return value;
	};

	var columns = [
	    {
		// similar to xtype: 'rownumberer',
		dataIndex: 'pos',
		resizable: false,
		minWidth: 42,
		maxWidth: 60,
		flex: 1,
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
		},
	    },
	    {
		xtype: 'checkcolumn',
		header: gettext('On'),
		dataIndex: 'enable',
		listeners: {
		    checkchange: function(column, recordIndex, checked) {
			var record = me.getStore().getData().items[recordIndex];
			record.commit();
			var data = {};
			Ext.Array.forEach(record.getFields(), function(field) {
			    data[field.name] = record.get(field.name);
			});
			if (!me.allow_iface || !data.iface) {
			    delete data.iface;
			}
			me.updateRule(data);
		    },
		},
		width: 40,
	    },
	    {
		header: gettext('Type'),
		dataIndex: 'type',
		renderer: function(value, metaData, record) {
		    return render_errors('type', value, metaData, record);
		},
		minWidth: 60,
		maxWidth: 80,
		flex: 2,
	    },
	    {
		header: gettext('Action'),
		dataIndex: 'action',
		renderer: function(value, metaData, record) {
		    return render_errors('action', value, metaData, record);
		},
		minWidth: 80,
		maxWidth: 200,
		flex: 2,
	    },
	    {
		header: gettext('Macro'),
		dataIndex: 'macro',
		renderer: function(value, metaData, record) {
		    return render_errors('macro', value, metaData, record);
		},
		minWidth: 80,
		flex: 2,
	    },
	];

	if (me.allow_iface) {
	    columns.push({
		header: gettext('Interface'),
		dataIndex: 'iface',
		renderer: function(value, metaData, record) {
		    return render_errors('iface', value, metaData, record);
		},
		minWidth: 80,
		flex: 2,
	    });
	}

	columns.push(
	    {
		header: gettext('Protocol'),
		dataIndex: 'proto',
		renderer: function(value, metaData, record) {
		    return render_errors('proto', value, metaData, record);
		},
		width: 75,
	    },
	    {
		header: gettext('Source'),
		dataIndex: 'source',
		renderer: function(value, metaData, record) {
		    return render_errors('source', value, metaData, record);
		},
		minWidth: 100,
		flex: 2,
	    },
	    {
		header: gettext('S.Port'),
		dataIndex: 'sport',
		renderer: function(value, metaData, record) {
		    return render_errors('sport', value, metaData, record);
		},
		width: 75,
	    },
	    {
		header: gettext('Destination'),
		dataIndex: 'dest',
		renderer: function(value, metaData, record) {
		    return render_errors('dest', value, metaData, record);
		},
		minWidth: 100,
		flex: 2,
	    },
	    {
		header: gettext('D.Port'),
		dataIndex: 'dport',
		renderer: function(value, metaData, record) {
		    return render_errors('dport', value, metaData, record);
		},
		width: 75,
	    },
	    {
		header: gettext('Log level'),
		dataIndex: 'log',
		renderer: function(value, metaData, record) {
		    return render_errors('log', value, metaData, record);
		},
		width: 100,
	    },
	    {
		header: gettext('Comment'),
		dataIndex: 'comment',
		flex: 10,
		minWidth: 75,
		renderer: function(value, metaData, record) {
		    let comment = render_errors('comment', Ext.util.Format.htmlEncode(value), metaData, record) || '';
		    if (comment.length * 12 > metaData.column.cellWidth) {
			comment = `<span data-qtip="${comment}">${comment}</span>`;
		    }
		    return comment;
		},
	    },
	);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: tbar,
            viewConfig: {
		plugins: [
		    {
			ptype: 'gridviewdragdrop',
			dragGroup: 'FWRuleDDGroup',
			dropGroup: 'FWRuleDDGroup',
		    },
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
		    itemdblclick: run_editor,
		},
	    },
	    sortableColumns: false,
	    columns: columns,
	});

	me.callParent();

	if (me.base_url) {
	    me.setBaseUrl(me.base_url); // load
	}
    },
}, function() {
    Ext.define('pve-fw-rule', {
	extend: 'Ext.data.Model',
	fields: [{ name: 'enable', type: 'boolean' },
		  'type', 'action', 'macro', 'source', 'dest', 'proto', 'iface',
		  'dport', 'sport', 'comment', 'pos', 'digest', 'errors'],
	idProperty: 'pos',
    });
});
