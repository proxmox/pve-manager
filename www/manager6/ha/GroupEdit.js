Ext.define('PVE.ha.GroupInputPanel', {
    extend: 'PVE.panel.InputPanel',
    onlineHelp: 'ha_manager_groups',

    groupId: undefined,

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'group';
	}

	return values;
    },

    initComponent : function() {
	var me = this;

	var update_nodefield, update_node_selection;

	var sm = Ext.create('Ext.selection.CheckboxModel', {
	    mode: 'SIMPLE',
	    listeners: {
		selectionchange: function(model, selected) {
		    update_nodefield(selected);
		}
	    }
	});

	// use already cached data to avoid an API call
	var data = PVE.data.ResourceStore.getNodes();

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'node', 'mem', 'cpu', 'priority' ],
	    data: data,
	    proxy: {
		type: 'memory',
		reader: {type: 'json'}
	    },
	    sorters: [
		{
		    property : 'node',
		    direction: 'ASC'
		}
	    ]
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
		    dataIndex: 'node'
		},
		{
		    header: gettext('Memory usage') + " %",
		    renderer: PVE.Utils.render_mem_usage_percent,
		    sortable: true,
		    width: 150,
		    dataIndex: 'mem'
		},
		{
		    header: gettext('CPU usage'),
		    renderer: PVE.Utils.render_cpu,
		    sortable: true,
		    width: 150,
		    dataIndex: 'cpu'
		},
		{
		    header: 'Priority',
		    xtype: 'widgetcolumn',
		    dataIndex: 'priority',
		    sortable: true,
		    stopSelection: true,
		    widget: {
			xtype: 'pveIntegerField',
			minValue: 0,
			maxValue: 1000,
			isFormField: false,
			listeners: {
			    change: function(numberfield, value, old_value) {
				var record = numberfield.getWidgetRecord();
				record.set('priority', value);
				update_nodefield(sm.getSelection());
			    }
			}
		    }
		}
	    ]
	});

	var nodefield = Ext.create('Ext.form.field.Hidden', {
	    name: 'nodes',
	    value: '',
	    listeners: {
		change: function (nodefield, value) {
		    update_node_selection(value);
		}
	    },
	    isValid: function () {
		var value = nodefield.getValue();
		return (value && 0 !== value.length);
	    }
	});

	update_node_selection = function(string) {
	    sm.deselectAll(true);

	    string.split(',').forEach(function (e, idx, array) {
		var res = e.split(':');

		store.each(function(record) {
		    var node = record.get('node');

		    if (node == res[0]) {
			sm.select(record, true);
			record.set('priority', res[1]);
			record.commit();
		    }
		});
	    });
	    nodegrid.reconfigure(store);

	};

	update_nodefield = function(selected) {
	    var nodes = '';
	    var first_iteration = true;
	    Ext.Array.each(selected, function(record) {
		if (!first_iteration) {
		    nodes += ',';
		}
		first_iteration = false;

		nodes += record.data.node;
		if (record.data.priority) {
		    nodes += ':' + record.data.priority;
		}
	    });

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
		allowBlank: false
	    },
	    nodefield
	];

	me.column2 = [
	    {
		xtype: 'pvecheckbox',
		name: 'restricted',
		uncheckedValue: 0,
		fieldLabel: 'restricted'
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'nofailback',
		uncheckedValue: 0,
		fieldLabel: 'nofailback'
	    }
	];

	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
	    },
	    nodegrid
	];
	
	me.callParent();
    }
});

Ext.define('PVE.ha.GroupEdit', {
    extend: 'PVE.window.Edit',

    groupId: undefined,

    initComponent : function() {
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
	    groupId: me.groupId
	});

	Ext.apply(me, {
            subject: gettext('HA Group'),
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
