Ext.define('PVE.form.ControllerSelector', {
    extend: 'Ext.form.FieldContainer',
    alias: ['widget.PVE.form.ControllerSelector'],
   
    statics: {
	maxIds: {
	    ide: 3,
	    sata: 5,
	    virtio: 15,
	    scsi: 13
	}
    },

    noVirtIO: false,

    noScsi: false,

    vmconfig: {}, // used to check for existing devices

    setVMConfig: function(vmconfig, autoSelect) {
	var me = this;

	me.vmconfig = Ext.apply({}, vmconfig);
	if (autoSelect) {
	    var clist = ['ide', 'virtio', 'scsi', 'sata'];
	    if (autoSelect === 'cdrom') {
		clist = ['ide', 'scsi', 'sata'];
		if (!Ext.isDefined(me.vmconfig.ide2)) {
		    me.down('field[name=controller]').setValue('ide');
		    me.down('field[name=deviceid]').setValue(2);
		    return;
		}
	    } else if (me.vmconfig.ostype === 'l26') {
		clist = ['virtio', 'ide', 'scsi', 'sata'];
	    }

	    Ext.Array.each(clist, function(controller) {
		var confid, i;
		if ((controller === 'virtio' && me.noVirtIO) ||
		    (controller === 'scsi' && me.noScsi)) {
		    return; //continue
		}
		me.down('field[name=controller]').setValue(controller);
		for (i = 0; i <= PVE.form.ControllerSelector.maxIds[controller]; i++) {
		    confid = controller + i.toString();
		    if (!Ext.isDefined(me.vmconfig[confid])) {
			me.down('field[name=deviceid]').setValue(i);
			return false; // break
		    }
		}
	    });
	}
	me.down('field[name=deviceid]').validate();
    },

    initComponent: function() {
	var me = this;

	Ext.apply(me, {
	    fieldLabel: gettext('Bus/Device'),
	    layout: 'hbox',
	    defaults: {
                flex: 1,
                hideLabel: true
	    },
	    items: [
		{
		    xtype: 'PVE.form.BusTypeSelector',
		    name: 'controller',
		    value: 'ide',
		    noVirtIO: me.noVirtIO,
		    noScsi: me.noScsi,
		    allowBlank: false,
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
		    xtype: 'numberfield',
		    name: 'deviceid',
		    minValue: 0,
		    maxValue: PVE.form.ControllerSelector.maxIds.ide,
		    value: '0',
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
