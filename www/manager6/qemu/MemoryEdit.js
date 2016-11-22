Ext.define('PVE.qemu.MemoryInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveQemuMemoryPanel',
    onlineHelp: 'qm_memory',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	var res;

	if (values.memoryType === 'fixed') {
	    res = { memory: values.memory };
	    if (values.ballooning === '1') {
		// if balloning is active if it is not explicitely set
		res['delete'] = "balloon,shares";
	    } else {
		res['delete'] = "shares";
		res.balloon = 0;
	    }
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
			me.down('field[name=ballooning]').setDisabled(!value);
			me.down('field[name=maxmemory]').setDisabled(value);
			me.down('field[name=balloon]').setDisabled(value);
			me.down('field[name=shares]').setDisabled(value);
		    }
		}
	    },
	    {
		xtype: 'pveMemoryField',
		name: 'memory',
		hotplug: me.hotplug,
		fieldLabel: gettext('Memory') + ' (MB)',
		labelAlign: 'right',
		labelWidth: labelWidth
	    },
	    {
		xtype: 'pvecheckbox',
		hotplug: me.hotplug,
		name: 'ballooning',
		value: '1',
		labelAlign: 'right',
		labelWidth: labelWidth,
		fieldLabel: gettext('Ballooning')
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
		xtype: 'pveMemoryField',
		name: 'maxmemory',
		hotplug: me.hotplug,
		disabled: true,
		value: '1024',
		fieldLabel: gettext('Maximum memory') + ' (MB)',
		labelAlign: 'right',
		labelWidth: labelWidth,
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
		xtype: 'pveIntegerField',
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
		xtype: 'pveIntegerField',
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
	    }
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
            hotplug: memoryhotplug
        });

	Ext.apply(me, {
	    subject: gettext('Memory'),
	    items: [ ipanel ],
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
		    ballooning: data.balloon === 0 ? '0' : '1',
		    shares: data.shares,
		    memoryType: data.balloon ? 'dynamic' : 'fixed'
		};
		ipanel.setValues(values);
	    }
	});
    }
});
