Ext.define('PVE.node.CephConfig', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeCephConfig',

    bodyStyle: 'white-space:pre',
    bodyPadding: 5,
    border: false,
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
		var data = response.result.data;
		me.update(Ext.htmlEncode(data));
	    }
	});
    },

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	Ext.apply(me, {
	    url: '/nodes/' + nodename + '/ceph/config',
	    listeners: {
		activate: function() {
		    me.load();
		}
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.node.CephConfigCrush', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeCephConfigCrush',

    onlineHelp: 'chapter_pveceph',

    layout: 'border',
    items: [{
	    title: gettext('Configuration'),
	    xtype: 'pveNodeCephConfig',
	    region: 'center'
	},
	{
	    title: 'Crush Map', // do not localize
	    xtype: 'pveNodeCephCrushMap',
	    region: 'east',
	    split: true,
	    width: '50%'
    }],

    initComponent: function() {
	var me = this;
	me.defaults = {
	    pveSelNode: me.pveSelNode
	};
	me.callParent();
    }
});
