Ext.define('PVE.ha.GroupInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    onlineHelp: 'ha_manager_groups',

    groupId: undefined,

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'group';
	}

	return values;
    },

    initComponent: function() {
	var me = this;

	let update_nodefield, update_node_selection;

	let sm = Ext.create('Ext.selection.CheckboxModel', {
	    mode: 'SIMPLE',
	    listeners: {
		selectionchange: function(model, selected) {
		    update_nodefield(selected);
		},
	    },
	});

	let store = Ext.create('Ext.data.Store', {
	    fields: ['node', 'mem', 'cpu', 'priority'],
	    data: PVE.data.ResourceStore.getNodes(), // use already cached data to avoid an API call
	    proxy: {
		type: 'memory',
		reader: { type: 'json' },
	    },
	    sorters: [
		{
		    property: 'node',
		    direction: 'ASC',
		},
	    ],
	});

	var nodegrid = Ext.createWidget('grid', {
	    store: store,
	    border: true,
	    height: 300,
	    selModel: sm,
	    columns: [
		{
		    header: gettext('Node'),
		    flex: 1,
		    dataIndex: 'node',
		},
		{
		    header: gettext('Memory usage') + " %",
		    renderer: PVE.Utils.render_mem_usage_percent,
		    sortable: true,
		    width: 150,
		    dataIndex: 'mem',
		},
		{
		    header: gettext('CPU usage'),
		    renderer: Proxmox.Utils.render_cpu,
		    sortable: true,
		    width: 150,
		    dataIndex: 'cpu',
		},
		{
		    header: gettext('Priority'),
		    xtype: 'widgetcolumn',
		    dataIndex: 'priority',
		    sortable: true,
		    stopSelection: true,
		    widget: {
			xtype: 'proxmoxintegerfield',
			minValue: 0,
			maxValue: 1000,
			isFormField: false,
			listeners: {
			    change: function(numberfield, value, old_value) {
				let record = numberfield.getWidgetRecord();
				record.set('priority', value);
				update_nodefield(sm.getSelection());
				record.commit();
			    },
			},
		    },
		},
	    ],
	});

	let nodefield = Ext.create('Ext.form.field.Hidden', {
	    name: 'nodes',
	    value: '',
	    listeners: {
		change: function(field, value) {
		    update_node_selection(value);
		},
	    },
	    isValid: function() {
		let value = this.getValue();
		return value && value.length !== 0;
	    },
	});

	update_node_selection = function(string) {
	    sm.deselectAll(true);

	    string.split(',').forEach(function(e, idx, array) {
		let [node, priority] = e.split(':');
		store.each(function(record) {
		    if (record.get('node') === node) {
			sm.select(record, true);
			record.set('priority', priority);
			record.commit();
		    }
		});
	    });
	    nodegrid.reconfigure(store);
	};

	update_nodefield = function(selected) {
	    let nodes = selected
		.map(({ data }) => data.node + (data.priority ? `:${data.priority}` : ''))
		.join(',');

	    // nodefield change listener calls us again, which results in a
	    // endless recursion, suspend the event temporary to avoid this
	    nodefield.suspendEvent('change');
	    nodefield.setValue(nodes);
	    nodefield.resumeEvent('change');
	};

	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'group',
		value: me.groupId || '',
		fieldLabel: 'ID',
		vtype: 'StorageId',
		allowBlank: false,
	    },
	    nodefield,
	];

	me.column2 = [
	    {
		xtype: 'proxmoxcheckbox',
		name: 'restricted',
		uncheckedValue: 0,
		fieldLabel: 'restricted',
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'nofailback',
		uncheckedValue: 0,
		fieldLabel: 'nofailback',
	    },
	];

	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment'),
	    },
	    nodegrid,
	];

	me.callParent();
    },
});

Ext.define('PVE.ha.GroupEdit', {
    extend: 'Proxmox.window.Edit',

    groupId: undefined,

    initComponent: function() {
	var me = this;

	me.isCreate = !me.groupId;

	if (me.isCreate) {
            me.url = '/api2/extjs/cluster/ha/groups';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/cluster/ha/groups/' + me.groupId;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.ha.GroupInputPanel', {
	    isCreate: me.isCreate,
	    groupId: me.groupId,
	});

	Ext.apply(me, {
            subject: gettext('HA Group'),
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
