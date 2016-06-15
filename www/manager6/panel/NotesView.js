Ext.define('PVE.panel.NotesView', {
    extend: 'Ext.panel.Panel',

    title: gettext("Notes"),
    bodyStyle: 'white-space:pre',
    bodyPadding: 10,
    scrollable: true,

    load: function() {
	var me = this;
	
	PVE.Utils.API2Request({
	    url: me.url,
	    waitMsgTarget: me,
	    failure: function(response, opts) {
		me.update(gettext('Error') + " " + response.htmlStatus);
	    },
	    success: function(response, opts) {
		var data = response.result.data.description || '';
		me.update(Ext.htmlEncode(data));
	    }
	});
    },

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var vmtype = me.pveSelNode.data.type;
	var url;

	if (vmtype === 'qemu') {
	    me.url = '/api2/extjs/nodes/' + nodename + '/qemu/' + vmid + '/config';
	} else if (vmtype === 'lxc') {
	    me.url = '/api2/extjs/nodes/' + nodename + '/lxc/' + vmid + '/config';
	} else {
	    throw "unknown vm type '" + vmtype + "'";
	}

	Ext.apply(me, {
	    listeners: {
		render: function(c) {
		    c.el.on('dblclick', function() { 
			var win = Ext.create('PVE.window.NotesEdit', {
			    pveSelNode: me.pveSelNode,
			    url: me.url
			});
			win.show();
			win.on('destroy', me.load, me);
		    });
		}
	    },
	    tools: [{
		type: 'gear',
		handler: function() {
		    var win = Ext.create('PVE.window.NotesEdit', {
			pveSelNode: me.pveSelNode,
			url: me.url
		    });
		    win.show();
		    win.on('destroy', me.load, me);
		}
	    }]
	});

	me.callParent();
    }
});
