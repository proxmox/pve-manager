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

    ipset_base_url: undefined,

    onGetValues: function(values) {
	var me = this;

	// hack: editable ComboGrid returns nothing when empty, so we need to set ''
	// Also, disabled text fields return nothing, so we need to set ''

	Ext.Array.each(['source', 'dest', 'proto', 'sport', 'dport'], function(key) {
	    if (values[key] === undefined) {
		values[key] = '';
	    }
	});

	delete values.modified_marker;
 
	return values;
    },

    initComponent : function() {
	var me = this;

	if (!me.ipset_base_url) {
	    throw "no ipset_base_url specified";
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

	var disable_query_for_ips = function(f, value) {
	    if (value.match(/^\d/)) { // IP address starts with \d
		f.queryDelay = 9999999999; // hack: disbale with long delay
	    } else {
		f.queryDelay = 10;
	    }
	};

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
		base_url: me.ipset_base_url,
		value: '',
		preferredValue: '', // hack: else Form sets dirty flag?
		fieldLabel: gettext('Source'),
		listeners: { change: disable_query_for_ips }
	    },
	    {
		xtype: 'pveIPSetSelector',
		name: 'dest',
		autoSelect: false,
		typeAhead: true,
		editable: true,
		base_url: me.ipset_base_url,
		value: '',
		preferredValue: '', // hack: else Form sets dirty flag?
		fieldLabel: gettext('Destination'),
		listeners: { change: disable_query_for_ips }
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
			    me.down('field[name=proto]').setValue('');
			    me.down('field[name=sport]').setDisabled(true);
			    me.down('field[name=sport]').setValue('');
			    me.down('field[name=dport]').setDisabled(true);
 			    me.down('field[name=dport]').setValue('');
                       }
                    }
                }
	    },
	    {
		xtype: 'pveIPProtocolSelector',
		name: 'proto',
		autoSelect: false,
		editable: true,
		value: '',
		fieldLabel: gettext('Protocol')
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
    ipset_base_url: undefined,

    allow_iface: false,

    initComponent : function() {
	/*jslint confusion: true */
	var me = this;

	if (!me.base_url) {
	    throw "no base_url specified";
	}
	if (!me.ipset_base_url) {
	    throw "no ipset_base_url specified";
	}

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
	    ipset_base_url: me.ipset_base_url,
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
		    var field = me.query('[isFormField][name=modified_marker]')[0];
		    field.setValue(1);
		    if (values.errors) {
			Ext.Function.defer(function() {
			    var form = ipanel.up('form').getForm();
			    form.markInvalid(values.errors)
			}, 100);
		    }
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
    ipset_base_url: undefined,

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

    updateRule: function(rule) {
        var me = this;

	if (!me.base_url) { 
	    return;
	}

	rule.enable = rule.enable ? 1 : 0;

	var pos = rule.pos;
	delete rule.pos;
	delete rule.errors;

	PVE.Utils.API2Request({
	    url: me.base_url + '/' + pos.toString(),
	    method: 'PUT',
	    params: rule,
	    waitMsgTarget: me,
	    failure: function(response, options) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
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

	if (!me.ipset_base_url) {
	    throw "no ipset_base_url specified";
	}

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
		ipset_base_url: me.ipset_base_url,
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
		    base_url: me.base_url,
		    ipset_base_url: me.ipset_base_url
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

	var render_errors = function(name, value, metaData, record) {
	    var errors = record.data.errors;
	    if (errors && errors[name]) {
		metaData.tdCls = 'x-form-invalid-field';
		var html = '<p>' +  Ext.htmlEncode(errors[name]) + '</p>';
		metaData.tdAttr = 'data-qwidth=600 data-qtitle="ERROR" data-qtip="' + 
		    html.replace(/\"/g,'&quot;') + '"';
	    }
	    return value;
	};

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
			me.updateRule(data);
		    }
		},
		width: 50
	    },
	    {
		header: gettext('Type'),
		dataIndex: 'type',
		renderer: function(value, metaData, record) {
		    return render_errors('type', value, metaData, record);
		},
		width: 50
	    },
	    {
		header: gettext('Action'),
		dataIndex: 'action',
		renderer: function(value, metaData, record) {
		    return render_errors('action', value, metaData, record);
		},
		width: 80
	    },
	    {
		header: gettext('Macro'),
		dataIndex: 'macro',
		renderer: function(value, metaData, record) {
		    return render_errors('macro', value, metaData, record);
		},
		width: 80
	    }
	];

	if (me.allow_iface) {
	    columns.push({
		header: gettext('Interface'),
		dataIndex: 'iface',
		renderer: function(value, metaData, record) {
		    return render_errors('iface', value, metaData, record);
		},
		width: 80
	    });
	}

	columns.push([
	    {
		header: gettext('Source'),
		dataIndex: 'source',
		renderer: function(value, metaData, record) {
		    return render_errors('source', value, metaData, record);
		},
		width: 100
	    },
	    {
		header: gettext('Destination'),
		dataIndex: 'dest',
		renderer: function(value, metaData, record) {
		    return render_errors('dest', value, metaData, record);
		},
		width: 100
	    },
	    {
		header: gettext('Protocol'),
		dataIndex: 'proto',
		renderer: function(value, metaData, record) {
		    return render_errors('proto', value, metaData, record);
		},
		width: 100
	    },
	    {
		header: gettext('Dest. port'),
		dataIndex: 'dport',
		renderer: function(value, metaData, record) {
		    return render_errors('dport', value, metaData, record);
		},
		width: 100
	    },
	    {
		header: gettext('Source port'),
		dataIndex: 'sport',
		renderer: function(value, metaData, record) {
		    return render_errors('sport', value, metaData, record);
		},
		width: 100
	    },
	    {
		header: gettext('Comment'),
		dataIndex: 'comment',
		flex: 1,
		renderer: function(value, metaData, record) {
		    return render_errors('comment', Ext.util.Format.htmlEncode(value), metaData, record);
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
	    sortableColumns: false,
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
		  'dport', 'sport', 'comment', 'pos', 'digest', 'errors' ],
	idProperty: 'pos'
    });

});
