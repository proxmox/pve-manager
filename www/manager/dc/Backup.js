Ext.define('PVE.dc.BackupEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveDcBackupEdit'],

    initComponent : function() {
        var me = this;

        me.create = !me.jobid;

	if (me.create) {
            url = '/api2/extjs/cluster/backup';
            method = 'POST';
        } else {
            url = '/api2/extjs/cluster/backup/' + me.jobid;
            method = 'PUT';
        }

	var vmidField = Ext.create('Ext.form.field.Hidden', {
	    name: 'vmid'
	});

	var selModeField =  Ext.create('PVE.form.KVComboBox', {
	    xtype: 'pveKVComboBox',
	    data: [
		['include', 'Include selected VMs'],
		['all', 'All VMs'],
		['exclude', 'Exclude selected VMs']
	    ],
	    fieldLabel: 'Selection mode',
	    name: 'selMode',
	    value: ''
	});

	var insideUpdate = false;
	
	var sm = Ext.create('Ext.selection.CheckboxModel', {
	    mode: 'SIMPLE',
	    listeners: {
		selectionchange: function(model, selected) {
		    if (!insideUpdate) { // avoid endless loop
			var sel = [];
			Ext.Array.each(selected, function(record) {
			    sel.push(record.data.vmid);
			});

			vmidField.setValue(sel);
		    }
		}
	    }
	});

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    fieldLabel: 'Storage',
	    nodename: 'localhost',
	    storageContent: 'backup',
	    allowBlank: false,
	    name: 'storage'
	});

	var store = new Ext.data.Store({
	    model: 'PVEResources',
	    sorters: { 
		property: 'vmid', 
		order: 'ASC' 
	    }
	});

	var vmgrid = Ext.createWidget('grid', {
	    store: store,
	    border: true,
	    height: 300,
	    selModel: sm,
	    disabled: true,
	    columns: [
		{ 
		    header: 'VMID',
		    dataIndex: 'vmid',
		    width: 60
		},
		{ 
		    header: 'Node',
		    dataIndex: 'node'
		},
		{ 
		    header: 'Status',
		    dataIndex: 'vmid',
		    dataIndex: 'uptime',
		    renderer: function(value) {
			if (value) {
			    return 'running';
			} else {
			    return 'stopped';
			}
		    }
		},
		{ 
		    header: 'Name', 
		    dataIndex: 'name',
		    flex: 1 
		},
		{ 
		    header: 'VM Type', 
		    dataIndex: 'type'
		}
	    ]
	});

	var nodesel = Ext.create('PVE.form.NodeSelector', {
	    name: 'node',
	    fieldLabel: 'Node',
	    allowBlank: true,
	    editable: true,
	    autoSelect: false,
	    emptyText: '-- any --',
	    listeners: {
		change: function(f, value) {
		    storagesel.setNodename(value || 'localhost');
		    var mode = selModeField.getValue();
		    store.clearFilter();
		    store.filterBy(function(rec) {
			return (!value || rec.get('node') === value);
		    });
		    if (mode === 'all') {
			sm.selectAll(true);
		    }
		}
	    }
	});

	var column1 = [
	    nodesel,
	    storagesel,
	    {
		xtype: 'pveDayOfWeekSelector',
		name: 'dow',
		fieldLabel: 'Day of week',
		multiSelect: true,
		value: ['sat'],
		allowBlank: false,
	    },
	    {
		xtype: 'timefield',
		fieldLabel: 'Start time',
		name: 'starttime',
		format: 'H:i',
		value: '00:00',
		allowBlank: false
	    },
	    selModeField
	];

	var column2 = [
	    {
		xtype: 'textfield',
		fieldLabel: 'Send email to',
		name: 'mailto'
	    },
	    {
		xtype: 'pvecheckbox',
		fieldLabel: 'Compression',
		name: 'compress',
		checked: true,
		uncheckedValue: 0
	    },
	    {
	    	xtype: 'numberfield',
		fieldLabel: 'Max files',
		name: 'maxfiles',
		minValue: 1,
		maxValue: 365,
		value: 1,
		allowBlank: false
	    },
	    {
		xtype: 'pveBackupModeSelector',
		fieldLabel: 'Mode',
		value: 'snapshot',
		name: 'mode'
	    },
	    vmidField
	];

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    column1: column1,
	    column2:  column2,
	    onGetValues: function(values) {
		if (!values.node) {
		    if (!me.create) {
			PVE.Utils.assemble_field_data(values, { 'delete': 'node' }); 
		    }
		    delete values.node;
		}

		var selMode = values.selMode;
		delete values.selMode;

		if (selMode === 'all') {
		    values.all = 1;
		    values.exclude = '';
		    delete values.vmid;
		} else if (selMode === 'exclude') {
		    values.all = 1;
		    values.exclude = values.vmid;
		    delete values.vmid;
		} else {
		    if (!me.create) {
			PVE.Utils.assemble_field_data(values, { 'delete': 'all' }); 
			PVE.Utils.assemble_field_data(values, { 'delete': 'exclude' });
		    }
		}

		return values;
	    }
	});

	var update_vmid_selection = function(list, mode) {
	    if (insideUpdate) {
		return; // should not happen - just to be sure
	    }
	    insideUpdate = true;
	    if (mode !== 'all') {
		sm.deselectAll(true);
		if (list) {
		    Ext.Array.each(list.split(','), function(vmid) {
			var rec = store.findRecord('vmid', vmid);
			if (rec) {
			    sm.select(rec, true);
			}
		    });
		}
	    }
	    insideUpdate = false;
	};

	vmidField.on('change', function(f, value) {
	    var mode = selModeField.getValue();
	    update_vmid_selection(value, mode);
	});

	selModeField.on('change', function(f, value, oldValue) {
	    if (value === 'all') {
		sm.selectAll(true);
		vmgrid.setDisabled(true);
	    } else {
		vmgrid.setDisabled(false);
	    }
	    if (oldValue === 'all') {
		sm.deselectAll(true);
		vmidField.setValue('');
	    }
	    var list = vmidField.getValue();
	    update_vmid_selection(list, value);
	});
		 
	var reload = function() {
	    store.load({
		params: { type: 'vm' },
		callback: function() {
		    var node = nodesel.getValue();
		    store.clearFilter();
		    store.filterBy(function(rec) {
			return (!node || rec.get('node') === node);
		    });
		    var list = vmidField.getValue();
		    var mode = selModeField.getValue();
		    if (mode === 'all') {
			sm.selectAll(true);
		    } else {
			update_vmid_selection(list, mode);
		    }
		}
	    });
	};

        Ext.applyIf(me, {
            title: me.create ? "Create Backup Job" : "Edit Backup Job",
            url: url,
            method: method,
	    items: [ ipanel, vmgrid ]
        });

        me.callParent();

        if (me.create) {
	    selModeField.setValue('include');
	} else {
            me.load({
		success: function(response, options) {
		    var data = response.result.data;

		    data.dow = data.dow.split(',');

		    if (data.all || data.exclude) {
			if (data.exclude) {
			    data.vmid = data.exclude;
			    data.selMode = 'exclude';
			} else {
			    data.vmid = '';
			    data.selMode = 'all';
			}
		    } else {
			data.selMode = 'include';
		    }

		    me.setValues(data);
               }
            });
        }

	reload();
    }
});


Ext.define('PVE.dc.BackupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveDcBackupView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-cluster-backup',
	    proxy: {
                type: 'pve',
		url: "/api2/json/cluster/backup"
	    }
	});

	var reload = function() {
	    store.load();
	};

	var run_editor = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

            var win = Ext.create('PVE.dc.BackupEdit',{
                jobid: rec.data.id
            });
            win.on('destroy', reload);
            win.show();
	};

	var edit_btn = new Ext.Button({
	    text: 'Edit',
	    disabled: true,
	    handler: run_editor
	});

	var remove_btn = new Ext.Button({
	    text: 'Remove',
	    disabled: true,
	    handler: function(){
		var sm = me.getSelectionModel();
		var rec = sm.getSelection()[0];

		if (!rec) {
		    return;
		}

		var msg = "Are you sure you want to delete this backup job?";

		Ext.Msg.confirm('Deletion Confirmation', msg, function(btn) {
		    if (btn !== 'yes') {
			return;
		    }
		    PVE.Utils.API2Request({
			url: '/cluster/backup/' + rec.data.id,
			method: 'DELETE',
			waitMsgTarget: me,
			callback: function() {
			    reload();
			},
			failure: function (response, opts) {
			    Ext.Msg.alert('Error', response.htmlStatus);
			}
		    });
		});
	    }
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		remove_btn.disable();
		edit_btn.disable();
		return;
	    }

	    edit_btn.setDisabled(false);
	    remove_btn.setDisabled(false);
	};

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    tbar: [ 	    
		{
		    text: 'Add',
		    handler: function() {
			var win = Ext.create('PVE.dc.BackupEdit',{});
			win.on('destroy', reload);
			win.show();
		    }
		},
		remove_btn,
		edit_btn
	    ],		
	    columns: [
		{
		    header: 'Node',
		    width: 100,
		    sortable: true,
		    dataIndex: 'node',
		    renderer: function(value) {
			if (value) {
			    return value;
			}
			return '-- all --';
		    }
		},
		{
		    header: 'Day of week',
		    width: 200,
		    sortable: false,
		    dataIndex: 'dow'
		},
		{
		    header: 'Start time',
		    width: 60,
		    sortable: true,
		    dataIndex: 'starttime',
		},
		{
		    header: 'Storage ID',
		    width: 100,
		    sortable: true,
		    dataIndex: 'storage'
		},
		{
		    header: 'Selection',
		    flex: 1,
		    sortable: false,
		    dataIndex: 'vmid',
		    renderer: function(value, metaData, record) {
			if (record.data.all) {
			    if (record.data.exclude) {
				return "all except " + record.data.exclude;
			    }
			    return "-- all --";
			}
			if (record.data.vmid) {
			    return record.data.vmid;
			}

			return "nothing selected";
		    }
		}
	    ],
	    listeners: {
		show: reload,
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});
	
	me.callParent();
    }
}, function() {

    Ext.define('pve-cluster-backup', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'id', 'starttime', 'dow',
	    'storage', 'node', 'vmid', 'exclude',
	    'mailto',
	    { name: 'all', type: 'boolean' },
	    { name: 'snapshot', type: 'boolean' },
	    { name: 'stop', type: 'boolean' },
	    { name: 'suspend', type: 'boolean' },
	    { name: 'compress', type: 'boolean' }
	]
    });
});