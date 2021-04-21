Ext.define('PVE.sdn.Browser', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.sdn.Browser',

    onlineHelp: 'chapter_pvesdn',

    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sdnid = me.pveSelNode.data.sdn;
	if (!sdnid) {
	    throw "no sdn ID specified";
	}

	me.items = [];

	var caps = Ext.state.Manager.get('GuiCap');

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Zone {0} on node {1}"),
				     "'" + sdnid + "'", "'" + nodename + "'"),
	    hstateid: 'sdntab',
	});

	if (caps.sdn['SDN.Audit']) {
	    me.items.push({
		xtype: 'pveSDNZoneContentView',
		title: gettext('Content'),
		iconCls: 'fa fa-th',
		itemId: 'content',
	    });
	}

	if (caps.sdn['Permissions.Modify']) {
	    me.items.push({
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		iconCls: 'fa fa-unlock',
		itemId: 'permissions',
		path: '/sdn/zones/' + sdnid,
	    });
	}

	me.callParent();
   },
});
