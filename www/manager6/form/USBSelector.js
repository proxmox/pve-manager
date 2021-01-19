Ext.define('PVE.form.USBSelector', {
    extend: 'Proxmox.form.ComboGrid',
    alias: ['widget.pveUSBSelector'],

    allowBlank: false,
    autoSelect: false,
    anyMatch: true,
    displayField: 'product_and_id',
    valueField: 'usbid',
    editable: true,

    validator: function(value) {
	var me = this;
	if (!value) {
	    return true; // handled later by allowEmpty in the getErrors call chain
	}
	value = me.getValue(); // as the valueField is not the displayfield
	if (me.type === 'device') {
	    return (/^[a-f0-9]{4}\:[a-f0-9]{4}$/i).test(value);
	} else if (me.type === 'port') {
	    return (/^[0-9]+\-[0-9]+(\.[0-9]+)*$/).test(value);
	}
	return gettext("Invalid Value");
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
		type: 'proxmox',
		url: `/api2/json/nodes/${nodename}/hardware/usb`,
	    },
	    filters: [
		function(item) {
		    return !!item.data.usbpath && !!item.data.prodid && item.data['class'] != 9;
		},
	    ],
	});
	let emptyText = '';
	if (me.type === 'device') {
	    emptyText = gettext('Passthrough a specific device');
	} else {
	    emptyText = gettext('Passthrough a full port');
	}

	Ext.apply(me, {
	    store: store,
	    emptyText: emptyText,
	    listConfig: {
		width: 520,
		columns: [
		    {
			header: (me.type === 'device')?gettext('Device'):gettext('Port'),
			sortable: true,
			dataIndex: 'usbid',
			width: 80,
		    },
		    {
			header: gettext('Manufacturer'),
			sortable: true,
			dataIndex: 'manufacturer',
			width: 150,
		    },
		    {
			header: gettext('Product'),
			sortable: true,
			dataIndex: 'product',
			flex: 1,
		    },
		    {
			header: gettext('Speed'),
			width: 75,
			sortable: true,
			dataIndex: 'speed',
			renderer: function(value) {
			    let speed_map = {
				"10000": "USB 3.1",
				 "5000": "USB 3.0",
				  "480": "USB 2.0",
				   "12": "USB 1.x",
				    "1.5": "USB 1.x",
			    };
			    return speed_map[value] || value + " Mbps";
			},
		    },
		],
	    },
	});

        me.callParent();

	store.load();
    },

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
		},
	    },
	    'speed', 'product', 'manufacturer', 'vendid', 'prodid', 'usbpath',
	    { name: 'port', type: 'number' },
	    { name: 'level', type: 'number' },
	    { name: 'class', type: 'number' },
	    { name: 'devnum', type: 'number' },
	    { name: 'busnum', type: 'number' },
	    {
		name: 'product_and_id',
		type: 'string',
		convert: (v, rec) => {
		    let res = rec.data.product || gettext('Unkown');
		    res += " (" + rec.data.usbid + ")";
		    return res;
		},
	    },
	],
    });

    Ext.define('pve-usb-port', {
	extend: 'Ext.data.Model',
	fields: [
	    {
		name: 'usbid',
		convert: function(val, data) {
		    if (val) {
			return val;
		    }
		    return data.get('busnum') + '-' + data.get('usbpath');
		},
	    },
	    'speed', 'product', 'manufacturer', 'vendid', 'prodid', 'usbpath',
	    { name: 'port', type: 'number' },
	    { name: 'level', type: 'number' },
	    { name: 'class', type: 'number' },
	    { name: 'devnum', type: 'number' },
	    { name: 'busnum', type: 'number' },
	    {
		name: 'product_and_id',
		type: 'string',
		convert: (v, rec) => {
		    let res = rec.data.product || gettext('Unplugged');
		    res += " (" + rec.data.usbid + ")";
		    return res;
		},
	    },
	],
    });
});
