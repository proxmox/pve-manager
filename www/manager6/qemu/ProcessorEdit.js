Ext.define('PVE.qemu.ProcessorInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveQemuProcessorPanel',
    onlineHelp: 'qm_cpu',

    insideWizard: false,

    // defines the possible cpu flags and their labels
    flagsAvail: ['pcid', 'spec-ctrl'],
    flagLabels: ['PCID', 'SPEC-CTRL'],

    onGetValues: function(values) {
	var me = this;

	// build the cpu options:
	me.cpu.cputype = values.cputype;

	var flags = [];

	me.flagsAvail.forEach(function(flag) {
	    if (values[flag]) {
		flags.push('+' + flag.toString());
	    }
	    delete values[flag];
	});

	me.cpu.flags = flags.length ? flags.join(';') : undefined;

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

    initComponent : function() {
	var me = this;

	me.cpu = {};

	me.column1 = [
	    {
		xtype: 'proxmoxintegerfield',
		name: 'sockets',
		minValue: 1,
		maxValue: 4,
		value: '1',
		fieldLabel: gettext('Sockets'),
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			var sockets = me.down('field[name=sockets]').getValue();
			var cores = me.down('field[name=cores]').getValue();
			me.down('field[name=totalcores]').setValue(sockets*cores);
		    }
		}
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'cores',
		minValue: 1,
		maxValue: 128,
		value: '1',
		fieldLabel: gettext('Cores'),
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			var sockets = me.down('field[name=sockets]').getValue();
			var cores = me.down('field[name=cores]').getValue();
			me.down('field[name=totalcores]').setValue(sockets*cores);
		    }
		}
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Enable NUMA'),
		name: 'numa',
		uncheckedValue: 0
	    }

	];


	me.column2 = [
	    {
		xtype: 'CPUModelSelector',
		name: 'cputype',
		value: '__default__',
		fieldLabel: gettext('Type')
	    },
	    {
		xtype: 'displayfield',
		fieldLabel: gettext('Total cores'),
		name: 'totalcores',
		value: '1'
	    }
	];

	me.flagsAvail.forEach(function(flag, i) {
	    me.column2.push({
		hidden: me.insideWizard,
		disabled: me.insideWizard,
		xtype: 'proxmoxcheckbox',
		fieldLabel: me.flagLabels[i] || flag,
		name: flag,
		uncheckedValue: 0
	    });
	});

	me.callParent();
    }
});

Ext.define('PVE.qemu.ProcessorEdit', {
    extend: 'Proxmox.window.Edit',

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
			var flags = cpu.flags.split(';');
			flags.forEach(function(flag) {
			    var sign = flag.substr(0,1);
			    flag = flag.substr(1);
			    data[flag] = (sign === '+');
			});
		    }
		}
		me.setValues(data);
	    }
	});
    }
});
