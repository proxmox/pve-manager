Ext.define('PVE.form.USBSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveUSBSelector'],
    allowBlank: false,
    autoSelect: false,
    displayField: 'usbid',
    valueField: 'usbid',
    editable: true,

    getUSBValue: function() {
	var me = this;
	var rec = me.store.findRecord('usbid', me.value);
	var val = 'host='+ me.value;
	if (rec && rec.data.speed === "5000") {
	    val = 'host=' + me.value + ",usb3=1";
	}
	return val;
    },

    validator: function(value) {
	var me = this;
	if (me.type === 'device') {
	    return (/^[a-f0-9]{4}\:[a-f0-9]{4}$/i).test(value);
	} else if (me.type === 'port') {
	    return (/^[0-9]+\-[0-9]+(\.[0-9]+)*$/).test(value);
	}
	return false;
    },

    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;

	if (!nodename) {
	    throw "no nodename specified";
	}

	if (me.type !== 'device' && me.type !== 'port') {
	    throw "no valid type specified";
	}

	var store = new Ext.data.Store({
	    model: 'pve-usb-' + me.type,
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/scan/usb"
	    },
	    filters: [
		function (item) {
		    return !!item.data.usbpath && !!item.data.prodid && item.data['class'] != 9;
		}
	    ]
	});

	Ext.apply(me, {
	    store: store,
            listConfig: {
		columns: [
		    {
			header: (me.type === 'device')?gettext('Device'):gettext('Port'),
			sortable: true,
			dataIndex: 'usbid',
			width: 80
		    },
		    {
			header: gettext('Manufacturer'),
			sortable: true,
			dataIndex: 'manufacturer',
			width: 100
		    },
		    {
			header: gettext('Product'),
			sortable: true,
			dataIndex: 'product',
			flex: 1
		    },
		    {
			header: gettext('Speed'),
			width: 70,
			sortable: true,
			dataIndex: 'speed',
			renderer: function(value) {
			    if (value === "5000") {
				return "USB 3.0";
			    } else if (value === "480") {
				return "USB 2.0";
			    } else {
				return "USB 1.x";
			    }
			}
		    }
		]
	    }
	});

        me.callParent();

	store.load();
    }

}, function() {

    Ext.define('pve-usb-device', {
	extend: 'Ext.data.Model',
	fields: [
	    {
		name: 'usbid',
		convert: function(val, data) {
		    if (val) {
			return val;
		    }
		    return data.get('vendid') + ':' + data.get('prodid');
		}
	    },
	    'speed', 'product', 'manufacturer', 'vendid', 'prodid', 'usbpath',
	    { name: 'port' , type: 'number' },
	    { name: 'level' , type: 'number' },
	    { name: 'class' , type: 'number' },
	    { name: 'devnum' , type: 'number' },
	    { name: 'busnum' , type: 'number' }
	]
    });

    Ext.define('pve-usb-port', {
	extend: 'Ext.data.Model',
	fields: [
	    {
		name: 'usbid',
		convert: function(val,data) {
		    if (val) {
			return val;
		    }
		    return data.get('busnum') + '-' + data.get('usbpath');
		}
	    },
	    'speed', 'product', 'manufacturer', 'vendid', 'prodid', 'usbpath',
	    { name: 'port' , type: 'number' },
	    { name: 'level' , type: 'number' },
	    { name: 'class' , type: 'number' },
	    { name: 'devnum' , type: 'number' },
	    { name: 'busnum' , type: 'number' }
	]
    });
});
