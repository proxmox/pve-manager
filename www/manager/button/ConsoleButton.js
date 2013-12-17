Ext.define('PVE.button.ConsoleButton', {
    extend: 'Ext.button.Split',
    alias: 'widget.pveConsoleButton',

    consoleType: 'shell', // one of 'shell', 'kvm', 'openvz', 'upgrade'

    consoleName: undefined,

    enableSpice: undefined,

    nodename: undefined,

    vmid: 0,

    setEnableSpice: function(enable){
	var me = this;

	me.enableSpice = enable;
	me.spiceMenu.setDisabled(!enable);
    },

    getEnableSpice: function() {
	var me = this;

	if (me.enableSpice === undefined) {
	    if (PVE.VersionInfo.console &&  PVE.VersionInfo.console === 'vv') {
		return true;
	    } else {
		return false;
	    }
	} else {
	    return me.enableSpice;
	}
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

	var create_vnc_console = function() {
	    if (me.consoleType === 'kvm') {
		PVE.Utils.openConsoleWindow('kvm', me.vmid, me.nodename, me.consoleName);
	    } else if (me.consoleType === 'openvz') {
		PVE.Utils.openConsoleWindow('openvz', me.vmid, me.nodename, me.consoleName);
	    } else if (me.consoleType === 'shell') {
		PVE.Utils.openConsoleWindow('shell', undefined, me.nodename);
	    } else if (me.consoleType === 'upgrade') {
		var url = Ext.urlEncode({ console: 'upgrade', node: me.nodename });
		var nw = window.open("?" + url, '_blank', "innerWidth=745,innerheight=427");
		nw.focus();
	    }
	};

	me.spiceMenu = Ext.create('Ext.menu.Item', {
	    text: 'SPICE',
	    handler: create_spice_console
	});

	var vncMenu = Ext.create('Ext.menu.Item', {
	    text: 'VNC',
	    handler: create_vnc_console
	});

	Ext.applyIf(me, { text: gettext('Console') });

	Ext.apply(me, {
	    handler: function() {
		if (!me.getEnableSpice() ||
		    (PVE.VersionInfo.console && PVE.VersionInfo.console === 'applet')) {
		    create_vnc_console();
		} else {
		    create_spice_console();
		}
	    },
	    menu: new Ext.menu.Menu({
		items: [ vncMenu, me.spiceMenu ]
	    })
	});

	me.callParent();
    }
});
