Ext.define('PVE.noVncConsole', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNoVncConsole',

    nodename: undefined,
    vmid: undefined,
    cmd: undefined,

    consoleType: undefined, // lxc, kvm, shell, cmd
    xtermjs: false,

    layout: 'fit',
    border: false,

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.consoleType) {
	    throw "no console type specified";
	}

	if (!me.vmid && me.consoleType !== 'shell' && me.consoleType !== 'cmd') {
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
		    let sp = Ext.state.Manager.getProvider();
		    if (Ext.isFunction(me.beforeLoad)) {
			me.beforeLoad();
		    }
		    let queryDict = {
			console: me.consoleType, // kvm, lxc, upgrade or shell
			vmid: me.vmid,
			node: me.nodename,
			cmd: me.cmd,
			'cmd-opts': me.cmdOpts,
			resize: sp.get('novnc-scaling', 'scale'),
		    };
		    queryDict[type] = 1;
		    PVE.Utils.cleanEmptyObjectKeys(queryDict);
		    var url = '/?' + Ext.Object.toQueryString(queryDict);
		    box.load(url);
		}
	    }
	});

	me.callParent();

	me.on('afterrender', function() {
	    me.focus();
	});
    },

    reload: function() {
	// reload IFrame content to forcibly reconnect VNC/xterm.js to VM
	var box = this.down('[itemid=vncconsole]');
	box.getWin().location.reload();
    }
});

