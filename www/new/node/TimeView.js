Ext.define('PVE.node.TimeView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveNodeTimeView'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	var tzoffset = (new Date()).getTimezoneOffset()*60000;
	var renderlocaltime = function(value) {
	    var servertime = new Date((value * 1000) + tzoffset);
	    return Ext.Date.format(servertime, 'Y-m-d H:i:s');
	};

	var run_editor = function() {
	    var win = Ext.create('PVE.node.TimeEdit', {
		pveSelNode: me.pveSelNode
	    });
	    win.show();
	};

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/time",
	    cwidth1: 150,
	    interval: 1000,
	    rows: {
		timezone: { 
		    header: 'Time zone', 
		    required: true, 
		},
		localtime: { 
		    header: 'Server time', 
		    required: true, 
		    renderer: renderlocaltime 
		}
	    },
	    tbar: [ 
		{
		    text: "Edit",
		    handler: run_editor
		}
	    ],
	    listeners: {
		itemdblclick: run_editor
	    }
	});

	me.callParent();

	me.on('show', me.rstore.startUpdate);
	me.on('hide', me.rstore.stopUpdate);
	me.on('destroy', me.rstore.stopUpdate);	
    }
});
