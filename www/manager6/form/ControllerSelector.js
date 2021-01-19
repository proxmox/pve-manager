Ext.define('PVE.form.ControllerSelector', {
    extend: 'Ext.form.FieldContainer',
    alias: 'widget.pveControllerSelector',

    noVirtIO: false,

    vmconfig: {}, // used to check for existing devices

    sortByPreviousUsage: function(vmconfig, controllerList) {
	let usedControllers = {};
	for (const type of Object.keys(PVE.Utils.diskControllerMaxIDs)) {
	    usedControllers[type] = 0;
	}

	for (const property of Object.keys(vmconfig)) {
	    if (property.match(PVE.Utils.bus_match) && !vmconfig[property].match(/media=cdrom/)) {
		const foundController = property.match(PVE.Utils.bus_match)[1];
		usedControllers[foundController]++;
	    }
	}

	var sortPriority = PVE.qemu.OSDefaults.getDefaults(vmconfig.ostype).busPriority;

	var sortedList = Ext.clone(controllerList);
	sortedList.sort(function(a, b) {
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
	    if (!Ext.isDefined(me.vmconfig.ide2)) {
		bussel.setValue('ide');
		deviceid.setValue(2);
		return;
	    }
	    clist = ['ide', 'scsi', 'sata'];
	} else {
	    // in most cases we want to add a disk to the same controller
	    // we previously used
	    clist = me.sortByPreviousUsage(me.vmconfig, clist);
	}

clist_loop:
	for (const controller of clist) {
	    bussel.setValue(controller);
	    for (let i = 0; i < PVE.Utils.diskControllerMaxIDs[controller]; i++) {
		let confid = controller + i.toString();
		if (!Ext.isDefined(me.vmconfig[confid])) {
		    deviceid.setValue(i);
		    break clist_loop; // we found the desired controller/id combo
		}
	    }
	}
	deviceid.validate();
    },

    initComponent: function() {
	var me = this;

	Ext.apply(me, {
	    fieldLabel: gettext('Bus/Device'),
	    layout: 'hbox',
	    defaults: {
                hideLabel: true,
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
			    if (!value) {
				return;
			    }
			    var field = me.down('field[name=deviceid]');
			    field.setMaxValue(PVE.Utils.diskControllerMaxIDs[value]);
			    field.validate();
			},
		    },
		},
		{
		    xtype: 'proxmoxintegerfield',
		    name: 'deviceid',
		    minValue: 0,
		    maxValue: PVE.Utils.diskControllerMaxIDs.ide,
		    value: '0',
		    flex: 1,
		    allowBlank: false,
		    validator: function(value) {
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
		    },
		},
	    ],
	});

	me.callParent();
    },
});
