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

	var hotplug = me.hotplug;

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
		minValue: 32,
		maxValue: 4096*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Memory') + ' (MB)',
		labelAlign: 'right',
		labelWidth: labelWidth,
		allowBlank: false,
		listeners: {
                    change: function(f, value, oldvalue) {
			var me = this;

			if(!hotplug) {
			    return;
			}

			//fill an array with dimms size
			var dimmarray = new Array (255);
			var dimm_size = 512;
			var current_size = 1024;
			var i;
			var j;
			var dimm_id = 0;
			for (j = 0; j < 8; j++) {
			    for (i = 0; i < 32; i++) {
				dimmarray[dimm_id] = current_size;
				current_size += dimm_size;				
				dimm_id++;
			    }
			    dimm_size *= 2;
			}
			//find nearest value in array
			var k = 0, closest, closestDiff, currentDiff
			closest = dimmarray[0];
			for(k; k < dimmarray.length;k++) {
			    closestDiff = Math.abs(value - closest);
			    currentDiff = Math.abs(value - dimmarray[k]);
			    if(currentDiff < closestDiff) {
				closest = dimmarray[k];
			    }
			    closestDiff = null;
			    currentDiff = null;
			}
			if(value != closest){
			    value = closest;
			}
		        f.setValue(value);

			//dynamic step
			if(value > oldvalue) {
			    if(value < 16384) {
				me.step = 512;
			    } else if(value >= 16384 && value < 49152) {
				me.step = 1024;
			    } else if (value >= 49152 && value < 114688) {
				me.step = 2048;
			    } else if (value >= 114688 && value < 245760) {
				me.step = 4096;
			    } else if (value >= 245760 && value < 507904) {
				me.step = 8192;
			    } else if (value >= 507904 && value < 1032192) {
				me.step = 16384;
			    } else if (value >= 1032192 && value < 2080768) {
				me.step = 32768;
			    } else if (value >= 2080768 && value < 4177920) {
				me.step = 65536;
			    }
			} else if (value < oldvalue) {
			    if(value <= 16384) {
				me.step = 512;
			    } else if(value > 16384 && value <= 49152) {
				me.step = 1024;
			    } else if (value > 49152 && value <= 114688) {
				me.step = 2048;
			    } else if (value > 114688 && value <= 245760) {
				me.step = 4096;
			    } else if (value > 245760 && value <= 507904) {
				me.step = 8192;
			    } else if (value > 507904 && value <= 1032192) {
				me.step = 16384;
			    } else if (value > 1032192 && value <= 2080768) {
				me.step = 32768;
			    } else if (value > 2080768 && value <= 4177920) {
				me.step = 65536;
			    }
			}
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
