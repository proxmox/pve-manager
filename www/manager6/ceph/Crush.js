Ext.define('PVE.node.CephCrushMap', {
    extend: 'Ext.panel.Panel',
    alias: ['widget.pveNodeCephCrushMap'],
    bodyStyle: 'white-space:pre',
    bodyPadding: 5,
    border: false,
    stateful: true,
    stateId: 'layout-ceph-crush',
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
	    url: '/nodes/' + nodename + '/ceph/crush',

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
