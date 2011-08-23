Ext.define('PVE.qemu.NotesView', {
    extend: 'Ext.panel.Panel',

    load: function() {
	var me = this;
	
	PVE.Utils.API2Request({
	    url: me.url,
	    waitMsgTarget: me,
	    failure: function(response, opts) {
		me.update("Error " + response.htmlStatus);
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

	Ext.apply(me, {
	    title: "Notes",
	    url: '/api2/extjs/nodes/' + nodename + '/qemu/' + vmid + '/config',
	    style: 'padding-left:10px',
	    bodyStyle: 'white-space:pre',
	    bodyPadding: 10,
	    autoScroll: true,
	    listeners: {
		render: function(c) {
		    c.el.on('dblclick', function() { 
			var win = Ext.create('PVE.qemu.NotesEdit', {
			    pveSelNode: me.pveSelNode,
			    url: me.url
			});
			win.show();
			win.on('destroy', me.load, me);
		    });
		}
	    }
	});

	me.callParent();
    }
});
