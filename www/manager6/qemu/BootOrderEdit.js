Ext.define('PVE.qemu.BootOrderPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveQemuBootOrderPanel',
    vmconfig: {}, // store loaded vm config

    bootdisk: undefined,
    selection: [],
    list: [],
    comboboxes: [],

    isBootDisk: function(value) {
	return PVE.Utils.bus_match.test(value);
    },

    setVMConfig: function(vmconfig) {
	var me = this;
	me.vmconfig = vmconfig;
	var order = me.vmconfig.boot || 'cdn';
	me.bootdisk = me.vmconfig.bootdisk || undefined;

	// get the first 3 characters
	// ignore the rest (there should never be more than 3)
	me.selection = order.split('').slice(0,3);

	// build bootdev list
	me.list = [];
	Ext.Object.each(me.vmconfig, function(key, value) {
	    if (me.isBootDisk(key) &&
		!(/media=cdrom/).test(value)) {
		me.list.push([key, "Disk '" + key + "'"]);
	    }
	});

	me.list.push(['d', 'CD-ROM']);
	me.list.push(['n', gettext('Network')]);
	me.list.push(['__none__', PVE.Utils.noneText]);

	me.recomputeList();

	me.comboboxes.forEach(function(box) {
	    box.resetOriginalValue();
	});
    },

    onGetValues: function(values) {
	var me = this;
	var order = me.selection.join('');
	var res = { boot: order };

	if  (me.bootdisk && order.indexOf('c') !== -1) {
	    res.bootdisk = me.bootdisk;
	} else {
	    res['delete'] = 'bootdisk';
	}

	return res;
    },

    recomputeSelection: function(combobox, newVal, oldVal) {
	var me = this.up('#inputpanel');
	me.selection = [];
	me.comboboxes.forEach(function(item) {
	    var val = item.getValue();

	    // when selecting an already selected item,
	    // switch it around
	    if ((val === newVal || (me.isBootDisk(val) && me.isBootDisk(newVal))) &&
		item.name !== combobox.name &&
		newVal !== '__none__') {
		// swap items
		val = oldVal;
	    }

	    // push 'c','d' or 'n' in the array
	    if (me.isBootDisk(val)) {
		me.selection.push('c');
		me.bootdisk = val;
	    } else if (val === 'd' ||
		       val === 'n') {
		me.selection.push(val);
	    }
	});

	me.recomputeList();
    },

    recomputeList: function(){
	var me = this;
	// set the correct values in the kvcomboboxes
	var cnt = 0;
	me.comboboxes.forEach(function(item) {
	    if (cnt === 0) {
		// never show 'none' on first combobox
		item.store.loadData(me.list.slice(0, me.list.length-1));
	    } else {
		item.store.loadData(me.list);
	    }
	    item.suspendEvent('change');
	    if (cnt < me.selection.length) {
		item.setValue((me.selection[cnt] !== 'c')?me.selection[cnt]:me.bootdisk);
	    } else if (cnt === 0){
		item.setValue('');
	    } else {
		item.setValue('__none__');
	    }
	    cnt++;
	    item.resumeEvent('change');
	    item.validate();
	});
    },

    initComponent : function() {
	var me = this;

	// this has to be done here, because of
	// the way our inputPanel class handles items
	me.comboboxes = [
		Ext.createWidget('pveKVComboBox', {
		fieldLabel: gettext('Boot device') + " 1",
		labelWidth: 120,
		name: 'bd1',
		allowBlank: false,
		listeners: {
		    change: me.recomputeSelection
		}
	    }),
		Ext.createWidget('pveKVComboBox', {
		fieldLabel: gettext('Boot device') + " 2",
		labelWidth: 120,
		name: 'bd2',
		allowBlank: false,
		listeners: {
		    change: me.recomputeSelection
		}
	    }),
		Ext.createWidget('pveKVComboBox', {
		fieldLabel: gettext('Boot device') + " 3",
		labelWidth: 120,
		name: 'bd3',
		allowBlank: false,
		listeners: {
		    change: me.recomputeSelection
		}
	    })
	];
	Ext.apply(me, { items: me.comboboxes });
	me.callParent();
    }
});

Ext.define('PVE.qemu.BootOrderEdit', {
    extend: 'PVE.window.Edit',

    items: [{
	xtype: 'pveQemuBootOrderPanel',
	itemId: 'inputpanel'
    }],

    subject: gettext('Boot Order'),

    initComponent : function() {
	var me = this;
	me.callParent();
	me.load({
	    success: function(response, options) {
		me.down('#inputpanel').setVMConfig(response.result.data);
	    }
	});
    }
});
