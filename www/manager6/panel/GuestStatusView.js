Ext.define('PVE.panel.GuestStatusView', {
    extend: 'Proxmox.panel.StatusView',
    alias: 'widget.pveGuestStatusView',
    mixins: ['Proxmox.Mixin.CBind'],

    height: 300,

    cbindData: function(initialConfig) {
	var me = this;
	return {
	    isQemu: me.pveSelNode.data.type === 'qemu',
	    isLxc: me.pveSelNode.data.type === 'lxc',
	};
    },

    layout: {
	type: 'vbox',
	align: 'stretch',
    },

    defaults: {
	xtype: 'pmxInfoWidget',
	padding: '2 25',
    },
    items: [
	{
	    xtype: 'box',
	    height: 20,
	},
	{
	    itemId: 'status',
	    title: gettext('Status'),
	    iconCls: 'fa fa-info fa-fw',
	    printBar: false,
	    multiField: true,
	    renderer: function(record) {
		var me = this;
		var text = record.data.status;
		var qmpstatus = record.data.qmpstatus;
		if (qmpstatus && qmpstatus !== record.data.status) {
		    text += ' (' + qmpstatus + ')';
		}
		return text;
	    },
	},
	{
	    itemId: 'hamanaged',
	    iconCls: 'fa fa-heartbeat fa-fw',
	    title: gettext('HA State'),
	    printBar: false,
	    textField: 'ha',
	    renderer: PVE.Utils.format_ha,
	},
	{
	    itemId: 'node',
	    iconCls: 'fa fa-building fa-fw',
	    title: gettext('Node'),
	    cbind: {
		text: '{pveSelNode.data.node}',
	    },
	    printBar: false,
	},
	{
	    xtype: 'box',
	    height: 15,
	},
	{
	    itemId: 'cpu',
	    iconCls: 'fa fa-fw pmx-itype-icon-processor pmx-icon',
	    title: gettext('CPU usage'),
	    valueField: 'cpu',
	    maxField: 'cpus',
	    renderer: Proxmox.Utils.render_cpu_usage,
	    // in this specific api call
	    // we already have the correct value for the usage
	    calculate: Ext.identityFn,
	},
	{
	    itemId: 'memory',
	    iconCls: 'fa fa-fw pmx-itype-icon-memory pmx-icon',
	    title: gettext('Memory usage'),
	    valueField: 'mem',
	    maxField: 'maxmem',
	},
	{
	    itemId: 'swap',
	    iconCls: 'fa fa-refresh fa-fw',
	    title: gettext('SWAP usage'),
	    valueField: 'swap',
	    maxField: 'maxswap',
	    cbind: {
		hidden: '{isQemu}',
		disabled: '{isQemu}',
	    },
	},
	{
	    itemId: 'rootfs',
	    iconCls: 'fa fa-hdd-o fa-fw',
	    title: gettext('Bootdisk size'),
	    valueField: 'disk',
	    maxField: 'maxdisk',
	    printBar: false,
	    renderer: function(used, max) {
		var me = this;
		me.setPrintBar(used > 0);
		if (used === 0) {
		    return Proxmox.Utils.render_size(max);
		} else {
		    return Proxmox.Utils.render_size_usage(used, max);
		}
	    },
	},
	{
	    xtype: 'box',
	    height: 15,
	},
	{
	    itemId: 'ips',
	    xtype: 'pveAgentIPView',
	    cbind: {
		rstore: '{rstore}',
		pveSelNode: '{pveSelNode}',
		hidden: '{isLxc}',
		disabled: '{isLxc}',
	    },
	},
    ],

    updateTitle: function() {
	var me = this;
	var uptime = me.getRecordValue('uptime');

	var text = "";
	if (Number(uptime) > 0) {
	    text = " (" + gettext('Uptime') + ': ' + Proxmox.Utils.format_duration_long(uptime)
		+ ')';
	}

	me.setTitle(me.getRecordValue('name') + text);
    },
});
