Ext.define('PVE.form.ControllerSelector', {
    extend: 'Ext.form.FieldContainer',
    alias: 'widget.pveControllerSelector',
   
    statics: {
	maxIds: {
	    ide: 3,
	    sata: 5,
	    virtio: 15,
	    scsi: 13
	}
    },

    noVirtIO: false,

    vmconfig: {}, // used to check for existing devices

    sortByPreviousUsage: function(vmconfig, controllerList) {

	var usedControllers = Ext.clone(PVE.form.ControllerSelector.maxIds);

	var type;
	for (type in usedControllers) {
	    if(usedControllers.hasOwnProperty(type)) {
		usedControllers[type] = 0;
	    }
	}

	var property;
	for (property in vmconfig) {
	    if (vmconfig.hasOwnProperty(property)) {
		if (property.match(PVE.Utils.bus_match) && !vmconfig[property].match(/media=cdrom/)) {
		    var foundController = property.match(PVE.Utils.bus_match)[1];
		    usedControllers[foundController]++;
		}
	    }
	}

	var vmDefaults = PVE.qemu.OSDefaults[vmconfig.ostype];

	var sortPriority = vmDefaults && vmDefaults.busPriority
	    ? vmDefaults.busPriority : PVE.qemu.OSDefaults.generic;

	var sortedList = Ext.clone(controllerList);
	sortedList.sort(function(a,b) {
	    if (usedControllers[b] == usedControllers[a]) {
		return sortPriority[b] - sortPriority[a];
	    }
	    return usedControllers[b] - usedControllers[a];
	});
	
	return sortedList;
    },

    setVMConfig: function(vmconfig, autoSelect) {
	var me = this;

	me.vmconfig = Ext.apply({}, vmconfig);

	var clist = ['ide', 'virtio', 'scsi', 'sata'];
	var bussel = me.down('field[name=controller]');
	var deviceid = me.down('field[name=deviceid]');

	if (autoSelect === 'cdrom') {
	    clist = ['ide', 'scsi', 'sata'];
	    if (!Ext.isDefined(me.vmconfig.ide2)) {
		bussel.setValue('ide');
		deviceid.setValue(2);
		return;
	    }
	} else  {
	    // in most cases we want to add a disk to the same controller
	    // we previously used
	    clist = me.sortByPreviousUsage(me.vmconfig, clist);
	}

	Ext.Array.each(clist, function(controller) {
	    var confid, i;
	    bussel.setValue(controller);
	    for (i = 0; i <= PVE.form.ControllerSelector.maxIds[controller]; i++) {
		confid = controller + i.toString();
		if (!Ext.isDefined(me.vmconfig[confid])) {
		    deviceid.setValue(i);
		    return false; // break
		}
	    }
	});
	deviceid.validate();
    },

    initComponent: function() {
	var me = this;

	Ext.apply(me, {
	    fieldLabel: gettext('Bus/Device'),
	    layout: 'hbox',
	    defaults: {
                hideLabel: true
	    },
	    items: [
		{
		    xtype: 'pveBusSelector',
		    name: 'controller',
		    value: PVE.qemu.OSDefaults.generic.busType,
		    noVirtIO: me.noVirtIO,
		    allowBlank: false,
		    flex: 2,
		    listeners: {
			change: function(t, value) {
			    if (!me.rendered || !value) {
				return;
			    }
			    var field = me.down('field[name=deviceid]');
			    field.setMaxValue(PVE.form.ControllerSelector.maxIds[value]);
			    field.validate();
			}
		    }
		},
		{
		    xtype: 'pveIntegerField',
		    name: 'deviceid',
		    minValue: 0,
		    maxValue: PVE.form.ControllerSelector.maxIds.ide,
		    value: '0',
		    flex: 1,
		    validator: function(value) {
			/*jslint confusion: true */
			if (!me.rendered) {
			    return;
			}
			var field = me.down('field[name=controller]');
			var controller = field.getValue();
			var confid = controller + value;
			if (Ext.isDefined(me.vmconfig[confid])) {
			    return "This device is already in use.";
			}
			return true;
		    }
		}
	    ]
	});

	me.callParent();
    }
});
