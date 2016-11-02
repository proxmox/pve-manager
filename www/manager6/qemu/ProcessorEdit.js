Ext.define('PVE.qemu.ProcessorInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveQemuProcessorPanel',
    onlineHelp: 'qm_cpu',

    onGetValues: function(values) {
	var me = this;

	// build the cpu options:
	me.cpu.cputype = values.cputype;
	delete values.cputype;
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
		xtype: 'pveIntegerField',
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
		xtype: 'pveIntegerField',
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
		xtype: 'pvecheckbox',
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

	me.callParent();
    }
});

Ext.define('PVE.qemu.ProcessorEdit', {
    extend: 'PVE.window.Edit',

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
		}
		me.setValues(data);
	    }
	});
    }
});
