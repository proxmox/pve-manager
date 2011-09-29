Ext.define('PVE.qemu.BootOrderPanel', {
    extend: 'PVE.panel.InputPanel',

    vmconfig: {}, // store loaded vm config

    bootdisk: undefined,
    curSel1: '',
    curSel2: '',
    curSel3: '',

    onGetValues: function(values) {
	var me = this;

	var order = '';

	if (me.curSel1) {
	    order = order + me.curSel1;
	}
	if (me.curSel2) {
	    order = order + me.curSel2;
	}
	if (me.curSel3) {
	    order = order + me.curSel3;
	}

	var res = { boot: order };
	if (me.bootdisk && (me.curSel1 === 'c' || me.curSel2 === 'c' || me.curSel3 === 'c') ) {
	    res.bootdisk =  me.bootdisk;
	} else {
	    res['delete'] = 'bootdisk';
	} 

	return res;
    },

    setVMConfig: function(vmconfig) {
	var me = this;

	me.vmconfig = vmconfig;

	var order = me.vmconfig.boot || 'cdn';
	me.bootdisk = me.vmconfig.bootdisk;
	if (!me.vmconfig[me.bootdisk]) {
	    me.bootdisk = undefined;
	}
	me.curSel1 = order.substring(0, 1) || '';
	me.curSel2 = order.substring(1, 2) || '';
	me.curSel3 = order.substring(2, 3) || '';

	me.compute_sel1();

	me.kv1.resetOriginalValue();
	me.kv2.resetOriginalValue();
	me.kv3.resetOriginalValue();
    },

    genList: function(includeNone, sel1, sel2) {
	var me = this;
	var list = [];

	if (sel1 !== 'c' && (sel2 !== 'c')) {
	    Ext.Object.each(me.vmconfig, function(key, value) {
		if ((/^(ide|scsi|virtio)\d+$/).test(key) &&
		    !(/media=cdrom/).test(value)) {
		    list.push([key, "Disk '" + key + "'"]);
		}
	    });
	}

	if (sel1 !== 'd' && (sel2 !== 'd')) {
	    list.push(['d', 'CD-ROM']);
	}
	if (sel1 !== 'n' && (sel2 !== 'n')) {
	    list.push(['n', 'Network']);
	}
	//if (sel1 !== 'a' && (sel2 !== 'a')) {
	//    list.push(['a', 'Floppy']);
	//}
	
	if (includeNone) {
	    list.push(['', 'None']);
	}

	return list;
    },

    compute_sel3: function() {
	var me = this;
	var list = me.genList(true, me.curSel1, me.curSel2);
	me.kv3.store.loadData(list);
	me.kv3.setValue((me.curSel3 === 'c') ? me.bootdisk : me.curSel3);
    },

    compute_sel2: function() {
	var me = this;
	var list = me.genList(true, me.curSel1);
	me.kv2.store.loadData(list);
	me.kv2.setValue((me.curSel2 === 'c') ? me.bootdisk : me.curSel2);
	me.compute_sel3();
    },

    compute_sel1: function() {
	var me = this;
	var list = me.genList(false);
	me.kv1.store.loadData(list);
	me.kv1.setValue((me.curSel1 === 'c') ? me.bootdisk : me.curSel1);
	me.compute_sel2();
    },

    initComponent : function() {
	var me = this;

	me.kv1 = Ext.create('PVE.form.KVComboBox', {
	    fieldLabel: 'First boot device',
	    labelWidth: 120,
	    name: 'bd1',
	    allowBlank: false,
	    data: []
	});

	me.kv2 = Ext.create('PVE.form.KVComboBox', {
	    fieldLabel: 'Second boot device',
	    labelWidth: 120,
	    name: 'bd2',
	    allowBlank: false,
	    data: []
	});

	me.kv3 = Ext.create('PVE.form.KVComboBox', {
	    fieldLabel: 'Third boot device',
	    labelWidth: 120,
	    name: 'bd3',
	    allowBlank: false,
	    data: []
	});

	me.mon(me.kv1, 'change', function(t, value) {
	    if ((/^(ide|scsi|virtio)\d+$/).test(value)) {
		me.curSel1 = 'c';
		me.bootdisk = value;
	    } else {
		me.curSel1 = value;
	    }
	    me.compute_sel2();
	});

	me.mon(me.kv2, 'change', function(t, value) {
	    if ((/^(ide|scsi|virtio)\d+$/).test(value)) {
		me.curSel2 = 'c';
		me.bootdisk = value;
	    } else {
		me.curSel2 = value;
	    }
	    me.compute_sel3();
	});

	me.mon(me.kv3, 'change', function(t, value) {
	    if ((/^(ide|scsi|virtio)\d+$/).test(value)) {
		me.curSel3 = 'c';
		me.bootdisk = value;
	    } else {
		me.curSel3 = value;
	    }
	});

	Ext.apply(me, {
	    items: [ me.kv1, me.kv2, me.kv3 ]	
	});
	
	me.callParent();
    }
});

Ext.define('PVE.qemu.BootOrderEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;
	
	var ipanel = Ext.create('PVE.qemu.BootOrderPanel', {});

	me.items = [ ipanel ];

	me.callParent();
	
	me.title = 'Boot order';

	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
	    }
	});
    }
});
