/*
 * Datacenter config panel, located in the center of the ViewPort after the Datacenter view is selected
 */

Ext.define('PVE.dc.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.dc.Config',

    onlineHelp: 'pve_admin_guide',

    initComponent: function() {
        var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

	me.items = [];

	Ext.apply(me, {
	    title: gettext("Datacenter"),
	    hstateid: 'dctab'
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
	    title: gettext('Summary'),
		xtype: 'pveDcSummary',
		iconCls: 'fa fa-book',
		itemId: 'summary'
	    });

	    me.items.push({
		xtype: 'pveDcOptionView',
		title: gettext('Options'),
		iconCls: 'fa fa-gear',
		itemId: 'options'
	    });
	}

	if (caps.storage['Datastore.Allocate'] || caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveStorageView',
		title: gettext('Storage'),
		iconCls: 'fa fa-database',
		itemId: 'storage'
	    });
	}

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveDcBackupView',
		iconCls: 'fa fa-floppy-o',
		title: gettext('Backup'),
		itemId: 'backup'
	    },
	    {
		xtype: 'pveReplicaView',
		iconCls: 'fa fa-retweet',
		title: gettext('Replication'),
		itemId: 'replication'
	    },
	    {
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		iconCls: 'fa fa-unlock',
		itemId: 'permissions',
		expandedOnInit: true
	    });
	}

	me.items.push({
	    xtype: 'pveUserView',
	    groups: ['permissions'],
	    iconCls: 'fa fa-user',
	    title: gettext('Users'),
	    itemId: 'users'
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveGroupView',
		title: gettext('Groups'),
		iconCls: 'fa fa-users',
		groups: ['permissions'],
		itemId: 'groups'
	    },
	    {
		xtype: 'pvePoolView',
		title: gettext('Pools'),
		iconCls: 'fa fa-tags',
		groups: ['permissions'],
		itemId: 'pools'
	    },
	    {
		xtype: 'pveRoleView',
		title: gettext('Roles'),
		iconCls: 'fa fa-male',
		groups: ['permissions'],
		itemId: 'roles'
	    },
	    {
		xtype: 'pveAuthView',
		title: gettext('Authentication'),
		groups: ['permissions'],
		iconCls: 'fa fa-key',
		itemId: 'domains'
	    },
	    {
		xtype: 'pveHAStatus',
		title: 'HA',
		iconCls: 'fa fa-heartbeat',
		itemId: 'ha'
	    },
	    {
		title: gettext('Groups'),
		groups: ['ha'],
		xtype: 'pveHAGroupsView',
		iconCls: 'fa fa-object-group',
		itemId: 'ha-groups'
	    },
	    {
		title: gettext('Fencing'),
		groups: ['ha'],
		iconCls: 'fa fa-bolt',
		xtype: 'pveFencingView',
		itemId: 'ha-fencing'
	    },
	    {
		xtype: 'pveFirewallRules',
		title: gettext('Firewall'),
		allow_iface: true,
		base_url: '/cluster/firewall/rules',
		list_refs_url: '/cluster/firewall/refs',
		iconCls: 'fa fa-shield',
		itemId: 'firewall'
	    },
	    {
		xtype: 'pveFirewallOptions',
		title: gettext('Options'),
		groups: ['firewall'],
		iconCls: 'fa fa-gear',
		base_url: '/cluster/firewall/options',
		onlineHelp: 'pve_firewall_cluster_wide_setup',
		fwtype: 'dc',
		itemId: 'firewall-options'
	    },
	    {
		xtype: 'pveSecurityGroups',
		title: gettext('Security Group'),
		groups: ['firewall'],
		iconCls: 'fa fa-group',
		itemId: 'firewall-sg'
	    },
	    {
		xtype: 'pveFirewallAliases',
		title: gettext('Alias'),
		groups: ['firewall'],
		iconCls: 'fa fa-external-link',
		base_url: '/cluster/firewall/aliases',
		itemId: 'firewall-aliases'
	    },
	    {
		xtype: 'pveIPSet',
		title: 'IPSet',
		groups: ['firewall'],
		iconCls: 'fa fa-list-ol',
		base_url: '/cluster/firewall/ipset',
		list_refs_url: '/cluster/firewall/refs',
		itemId: 'firewall-ipset'
	    },
	    {
		xtype: 'pveDcSupport',
		title: gettext('Support'),
		itemId: 'support',
		iconCls: 'fa fa-comments-o'
	    });
	}

	me.callParent();
   }
});
