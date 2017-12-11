Ext.define('PVE.noVncConsole', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNoVncConsole',

    nodename: undefined,

    vmid: undefined,

    consoleType: undefined, // lxc or kvm

    layout: 'fit',

    xtermjs: false,

    border: false,

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.consoleType) {
	    throw "no console type specified";
	}

	if (!me.vmid && me.consoleType !== 'shell') {
	    throw "no VM ID specified";
	}

	// always use same iframe, to avoid running several noVnc clients
	// at same time (to avoid performance problems)
	var box = Ext.create('Ext.ux.IFrame', { itemid : "vncconsole" });

	var type = me.xtermjs ? 'xtermjs' : 'novnc';

	Ext.apply(me, {
	    items: box,
	    listeners: {
		activate: function() {
		    var url = '/?console=' + me.consoleType + '&' + type + '=1&node=' + me.nodename + '&resize=scale';
		    if (me.vmid) {
			url += '&vmid='+ me.vmid;
		    }
		    box.load(url);
		}
	    }
	});

	me.callParent();

	me.on('afterrender', function() {
	    me.focus();
	});
    }
});

