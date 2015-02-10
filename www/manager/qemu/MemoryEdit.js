Ext.define('PVE.qemu.MemoryInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.MemoryInputPanel',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	var res;

	if (values.memoryType === 'fixed') {
	    res = { memory: values.memory };
	    res['delete'] = "balloon,shares";
	} else {
	    res = { 
		memory: values.maxmemory,
		balloon: values.balloon
	    };
	    if (Ext.isDefined(values.shares) && (values.shares !== "")) {
		res.shares = values.shares;
	    } else {
		res['delete'] = "shares";
	    }
	}

	return res;
    },

    initComponent : function() {
	var me = this;
	var labelWidth = 160;

	var items = [
	    {
		xtype: 'radiofield',
		name: 'memoryType',
		inputValue: 'fixed',
		boxLabel: gettext('Use fixed size memory'),
		checked: true,
		listeners: {
		    change: function(f, value) {
			if (!me.rendered) {
			    return;
			}
			me.down('field[name=memory]').setDisabled(!value);
			me.down('field[name=maxmemory]').setDisabled(value);
			me.down('field[name=balloon]').setDisabled(value);
			me.down('field[name=shares]').setDisabled(value);
		    }
		}
	    },
	    {
		xtype: 'numberfield',
		name: 'memory',
		hotplug: me.hotplug,
		minValue: me.hotplug ? 1024 : 32,
		maxValue: 4178944,
		value:  me.hotplug ? '1024' : '512',
		step: 32,
		fieldLabel: gettext('Memory') + ' (MB)',
		labelAlign: 'right',
		labelWidth: labelWidth,
		allowBlank: false,
		computeUpDown: function(value) {
		    var me = this;

		    if (!me.hotplug) {
			return { up: value + me.step, down: value - me.step };
		    }

		    var dimm_size = 512;
		    var prev_dimm_size = 0;
		    var min_size = 1024;
		    var current_size = min_size;
		    var value_up = min_size;
		    var value_down = min_size;

		    var i, j;
		    for (j = 0; j < 9; j++) {
			for (i = 0; i < 32; i++) {
			    if ((value >= current_size) && (value < (current_size + dimm_size))) {
				value_up = current_size + dimm_size;
				value_down = current_size - ((i === 0) ? prev_dimm_size : dimm_size);
			    }
			    current_size += dimm_size;				
			}
			prev_dimm_size = dimm_size;
			dimm_size = dimm_size*2;
		    }

		    return { up: value_up, down: value_down };
		},
		onSpinUp: function() {
		    var me = this;
		    if (!me.readOnly) {
			var res = me.computeUpDown(me.getValue());
			me.setValue(Ext.Number.constrain(res.up, me.minValue, me.maxValue));
		    }
		},
		onSpinDown: function() {
		    var me = this;
		    if (!me.readOnly) {
			var res = me.computeUpDown(me.getValue());
			me.setValue(Ext.Number.constrain(res.down, me.minValue, me.maxValue));
		    }
		}
	    },
	    {
		xtype: 'radiofield',
		name: 'memoryType',
		inputValue: 'dynamic',
		boxLabel: gettext('Automatically allocate memory within this range'),
		listeners: {
		    change: function(f, value) {
			if (!me.rendered) {
			    return;
			}
		    }
		}
	    },
	    {
		xtype: 'numberfield',
		name: 'maxmemory',
		disabled: true,
		minValue: 32,
		maxValue: 512*1024,
		value: '1024',
		step: 32,
		fieldLabel: gettext('Maximum memory') + ' (MB)',
		labelAlign: 'right',
		labelWidth: labelWidth,
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			var bf = me.down('field[name=balloon]');
			var balloon = bf.getValue();
			if (balloon > value) {
			    bf.setValue(value);
			}
			bf.setMaxValue(value);
		    }
		}
	    },
	    {
		xtype: 'numberfield',
		name: 'balloon',
		disabled: true,
		minValue: 0,
		maxValue: 512*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Minimum memory') + ' (MB)',
		labelAlign: 'right',
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'shares',
		disabled: true,
		minValue: 0,
		maxValue: 50000,
		value: '',
		step: 10,
		fieldLabel: gettext('Shares'),
		labelAlign: 'right',
		labelWidth: labelWidth,
		allowBlank: true,
		emptyText: PVE.Utils.defaultText + ' (1000)',
		submitEmptyText: false
	    },
	];

	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}

	me.callParent();
    }
});

Ext.define('PVE.qemu.MemoryEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	var memoryhotplug;
	if(me.hotplug) {
	    Ext.each(me.hotplug.split(','), function(el) {
		if (el === 'memory') {
		    memoryhotplug = 1;
	        }
	    });
	}
	
        var ipanel = Ext.create('PVE.qemu.MemoryInputPanel', {
            hotplug: memoryhotplug,
        });

	Ext.apply(me, {
	    subject: gettext('Memory'),
	    items: ipanel,
	    // uncomment the following to use the async configiguration API
	    // backgroundDelay: 5, 
	    width: 400
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var data = response.result.data;

		var values = {
		    memory: data.memory,
		    maxmemory: data.memory,
		    balloon: data.balloon,
		    shares: data.shares,
		    memoryType: data.balloon ? 'dynamic' : 'fixed',
		};
		ipanel.setValues(values);
	    }
	});
    }
});
