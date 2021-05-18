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

	let sortPriority = PVE.qemu.OSDefaults.getDefaults(vmconfig.ostype).busPriority;

	let sortedList = Ext.clone(controllerList);
	sortedList.sort(function(a, b) {
	    if (usedControllers[b] === usedControllers[a]) {
		return sortPriority[b] - sortPriority[a];
	    }
	    return usedControllers[b] - usedControllers[a];
	});

	return sortedList;
    },

    setToFree: function(controllers, busField, deviceIDField) {
	let me = this;
	for (const controller of controllers) {
	    busField.setValue(controller);
	    for (let i = 0; i < PVE.Utils.diskControllerMaxIDs[controller]; i++) {
		let confid = controller + i.toString();
		if (!Ext.isDefined(me.vmconfig[confid])) {
		    deviceIDField.setValue(i);
		    return;
		}
	    }
	}
    },

    setVMConfig: function(vmconfig, autoSelect) {
	let me = this;

	me.vmconfig = Ext.apply({}, vmconfig);

	let bussel = me.down('field[name=controller]');
	let deviceid = me.down('field[name=deviceid]');

	let clist = ['ide', 'virtio', 'scsi', 'sata'];
	if (autoSelect === 'cdrom') {
	    if (!Ext.isDefined(me.vmconfig.ide2)) {
		bussel.setValue('ide');
		deviceid.setValue(2);
		return;
	    }
	    clist = ['ide', 'scsi', 'sata'];
	} else {
	    // in most cases we want to add a disk to the same controller we previously used
	    clist = me.sortByPreviousUsage(me.vmconfig, clist);
	}

	me.setToFree(clist, bussel, deviceid);

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
			    let field = me.down('field[name=deviceid]');
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
			    return undefined;
			}
			let controller = me.down('field[name=controller]').getValue();
			let confid = controller + value;
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
