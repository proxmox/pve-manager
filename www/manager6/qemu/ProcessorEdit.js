Ext.define('PVE.qemu.ProcessorInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuProcessorPanel',
    onlineHelp: 'qm_cpu',

    insideWizard: false,

    viewModel: {
	data: {
	    socketCount: 1,
	    coreCount: 1,
	},
	formulas: {
	    totalCoreCount: get => get('socketCount') * get('coreCount'),
	},
    },

    controller: {
	xclass: 'Ext.app.ViewController',
    },

    onGetValues: function(values) {
	var me = this;

	if (Array.isArray(values['delete'])) {
	    values['delete'] = values['delete'].join(',');
	}

	PVE.Utils.delete_if_default(values, 'cpulimit', '0', 0);
	PVE.Utils.delete_if_default(values, 'cpuunits', '1024', 0);

	// build the cpu options:
	me.cpu.cputype = values.cputype;

	if (values.flags) {
	    me.cpu.flags = values.flags;
	} else {
	    delete me.cpu.flags;
	}

	delete values.cputype;
	delete values.flags;
	var cpustring = PVE.Parser.printQemuCpu(me.cpu);

	// remove cputype delete request:
	var del = values['delete'];
	delete values['delete'];
	if (del) {
	    del = del.split(',');
	    Ext.Array.remove(del, 'cputype');
	} else {
	    del = [];
	}

	if (cpustring) {
	    values.cpu = cpustring;
	} else {
	    del.push('cpu');
	}

	var delarr = del.join(',');
	if (delarr) {
	    values['delete'] = delarr;
	}

	return values;
    },

    cpu: {},

    column1: [
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'sockets',
	    minValue: 1,
	    maxValue: 4,
	    value: '1',
	    fieldLabel: gettext('Sockets'),
	    allowBlank: false,
	    bind: {
		value: '{socketCount}',
	    },
	},
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'cores',
	    minValue: 1,
	    maxValue: 128,
	    value: '1',
	    fieldLabel: gettext('Cores'),
	    allowBlank: false,
	    bind: {
		value: '{coreCount}',
	    },
	},
    ],

    column2: [
	{
	    xtype: 'CPUModelSelector',
	    name: 'cputype',
	    fieldLabel: gettext('Type')
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Total cores'),
	    name: 'totalcores',
	    isFormField: false,
	    bind: {
		value: '{totalCoreCount}',
	    },
	},
    ],

    advancedColumn1: [
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'vcpus',
	    minValue: 1,
	    maxValue: 1,
	    value: '',
	    fieldLabel: gettext('VCPUs'),
	    deleteEmpty: true,
	    allowBlank: true,
	    emptyText: '1',
	    bind: {
		emptyText: '{totalCoreCount}',
		maxValue: '{totalCoreCount}',
	    },
	},
	{
	    xtype: 'numberfield',
	    name: 'cpulimit',
	    minValue: 0,
	    maxValue: 128, // api maximum
	    value: '',
	    step: 1,
	    fieldLabel: gettext('CPU limit'),
	    allowBlank: true,
	    emptyText: gettext('unlimited')
	}
    ],

    advancedColumn2: [
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'cpuunits',
	    fieldLabel: gettext('CPU units'),
	    minValue: 8,
	    maxValue: 500000,
	    value: '1024',
	    deleteEmpty: true,
	    allowBlank: true
	},
	{
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('Enable NUMA'),
	    name: 'numa',
	    uncheckedValue: 0
	}
    ],
    advancedColumnB: [
	{
	    xtype: 'label',
	    text: 'Extra CPU Flags:'
	},
	{
	    xtype: 'vmcpuflagselector',
	    name: 'flags'
	}
    ]
});

Ext.define('PVE.qemu.ProcessorEdit', {
    extend: 'Proxmox.window.Edit',

    width: 700,

    initComponent : function() {
	var me = this;

	var ipanel = Ext.create('PVE.qemu.ProcessorInputPanel');

	Ext.apply(me, {
	    subject: gettext('Processors'),
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var data = response.result.data;
		var value = data.cpu;
		if (value) {
		    var cpu = PVE.Parser.parseQemuCpu(value);
		    ipanel.cpu = cpu;
		    data.cputype = cpu.cputype;
		    if (cpu.flags) {
			data.flags = cpu.flags;
		    }
		}
		me.setValues(data);
	    }
	});
    }
});
