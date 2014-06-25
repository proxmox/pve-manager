Ext.define('PVE.button.ConsoleButton', {
    extend: 'Ext.button.Split',
    alias: 'widget.pveConsoleButton',

    consoleType: 'shell', // one of 'shell', 'kvm', 'openvz', 'upgrade'

    consoleName: undefined,

    enableSpice: true,

    nodename: undefined,

    vmid: 0,

    setEnableSpice: function(enable){
	var me = this;

	me.enableSpice = enable;
	me.spiceMenu.setDisabled(!enable);
    },

    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.consoleName) {
	    if (me.consoleType === 'kvm') {
		me.consoleName = "VM " + me.vmid.toString();
	    } else if (me.consoleType === 'openvz') {
		me.consoleName = "CT " + me.vmid.toString();
	    } else {
		me.consoleName = "Shell";
	    }
	}

	var create_spice_console = function() {
	    var url;
	    var params = { proxy: window.location.hostname };
	    if (me.consoleType === 'kvm') {
		url = '/nodes/' + me.nodename + '/qemu/' + 
		    me.vmid.toString() + '/spiceproxy';
		PVE.Utils.openSpiceViewer(url, params);
	    } else if (me.consoleType === 'openvz') {
		url = '/nodes/' + me.nodename + '/openvz/' + 
		    me.vmid.toString() + '/spiceproxy';
		PVE.Utils.openSpiceViewer(url, params);
	    } else if (me.consoleType === 'shell') {
		url = '/nodes/' + me.nodename + '/spiceshell';
		PVE.Utils.openSpiceViewer(url, params);
	    } else if (me.consoleType === 'upgrade') {
		url = '/nodes/' + me.nodename + '/spiceshell';
		params.upgrade = 1;
		PVE.Utils.openSpiceViewer(url, params);
	    }
	};

	var create_vnc_console = function(novnc) {
	    if (me.consoleType === 'kvm') {
		PVE.Utils.openConsoleWindow('kvm', me.vmid, me.nodename, me.consoleName, novnc);
	    } else if (me.consoleType === 'openvz') {
		PVE.Utils.openConsoleWindow('openvz', me.vmid, me.nodename, me.consoleName, novnc);
	    } else if (me.consoleType === 'shell') {
		PVE.Utils.openConsoleWindow('shell', undefined, me.nodename, undefined, novnc);
	    } else if (me.consoleType === 'upgrade') {
		var url = Ext.urlEncode({ console: 'upgrade', node: me.nodename, novnc: novnc });
		var nw = window.open("?" + url, '_blank', "innerWidth=745,innerheight=427");
		nw.focus();
	    }
	};

	me.spiceMenu = Ext.create('Ext.menu.Item', {
	    text: 'SPICE',
	    iconCls: 'pve-itype-icon-virt-viewer',
	    handler: create_spice_console
	});

	var vncMenu = Ext.create('Ext.menu.Item', {
	    text: 'VNC',
	    iconCls: 'pve-itype-icon-tigervnc',
	    handler: function() { create_vnc_console(0); }
	});

	var noVncMenu = Ext.create('Ext.menu.Item', {
	    text: 'noVNC',
	    iconCls: 'pve-itype-icon-novnc',
	    handler: function() { create_vnc_console(1); }
	});

	Ext.applyIf(me, { text: gettext('Console') });

	Ext.apply(me, {
	    handler: function() {
		var dv = PVE.Utils.defaultViewer(me.enableSpice);
		if (dv === 'vv') {
		    create_spice_console();
		} else if (dv === 'applet') {
		    create_vnc_console(0);
		} else if (dv === 'html5') {
		    create_vnc_console(1);
		} else {
		    throw "unknown defaultViewer";
		}
	    },
	    menu: new Ext.menu.Menu({
		items: [ noVncMenu, vncMenu, me.spiceMenu ]
	    })
	});

	me.callParent();
    }
});
