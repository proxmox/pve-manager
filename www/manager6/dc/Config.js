/*
 * Datacenter config panel, located in the center of the ViewPort after the Datacenter view is selected
 */

Ext.define('PVE.dc.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.dc.Config',

    onlineHelp: 'pve-admin-guide.html',

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
		onlineHelp: 'datacenter.cfg.5.html',
		iconCls: 'fa fa-gear',
		itemId: 'options'
	    });
	}

	if (caps.storage['Datastore.Allocate'] || caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveStorageView',
		title: gettext('Storage'),
		onlineHelp: 'chapter-pvesm.html',
		iconCls: 'fa fa-database',
		itemId: 'storage'
	    });
	}

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveDcBackupView',
		iconCls: 'fa fa-floppy-o',
		onlineHelp: 'chapter-vzdump.html',
		title: gettext('Backup'),
		itemId: 'backup'
	    },
	    {
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		iconCls: 'fa fa-unlock',
		onlineHelp: 'chapter-pveum.html',
		itemId: 'permissions',
		expandedOnInit: true
	    });
	}

	me.items.push({
	    xtype: 'pveUserView',
	    groups: ['permissions'],
	    iconCls: 'fa fa-user',
	    onlineHelp: 'chapter-pveum.html#_users',
	    title: gettext('Users'),
	    itemId: 'users'
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveGroupView',
		title: gettext('Groups'),
		iconCls: 'fa fa-users',
		onlineHelp: 'chapter-pveum.html#_groups',
		groups: ['permissions'],
		itemId: 'groups'
	    },
	    {
		xtype: 'pvePoolView',
		title: gettext('Pools'),
		iconCls: 'fa fa-tags',
		onlineHelp: 'chapter-pveum.html#_pools',
		groups: ['permissions'],
		itemId: 'pools'
	    },
	    {
		xtype: 'pveRoleView',
		title: gettext('Roles'),
		iconCls: 'fa fa-male',
		onlineHelp: 'chapter-pveum.html#_roles',
		groups: ['permissions'],
		itemId: 'roles'
	    },
	    {
		xtype: 'pveAuthView',
		title: gettext('Authentication'),
		groups: ['permissions'],
		onlineHelp: 'chapter-pveum.html#_authentication_realms',
		iconCls: 'fa fa-key',
		itemId: 'domains'
	    },
	    {
		xtype: 'pveHAStatusView',
		title: 'HA',
		iconCls: 'fa fa-heartbeat',
		onlineHelp: 'chapter-ha-manager.html',
		itemId: 'ha'
	    },
	    {
		title: gettext('Resources'),
		groups: ['ha'],
		iconCls: 'fa fa-th',
		onlineHelp: 'chapter-ha-manager.html#_resources',
		xtype: 'pveHAResourcesView',
		itemId: 'resources'
	    },
	    {
		title: gettext('Groups'),
		groups: ['ha'],
		xtype: 'pveHAGroupsView',
		onlineHelp: 'chapter-ha-manager.html#_groups',
		iconCls: 'fa fa-object-group',
		itemId: 'ha-groups'
	    },
	    {
		title: gettext('Fencing'),
		groups: ['ha'],
		iconCls: 'fa fa-bolt',
		onlineHelp: 'chapter-ha-manager.html#_fencing',
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
		onlineHelp: 'chapter-pve-firewall.html',
		itemId: 'firewall'
	    },
	    {
		xtype: 'pveFirewallOptions',
		title: gettext('Options'),
		groups: ['firewall'],
		iconCls: 'fa fa-gear',
		base_url: '/cluster/firewall/options',
		onlineHelp: 'chapter-pve-firewall.html#_cluster_wide_setup',
		fwtype: 'dc',
		itemId: 'firewall-options'
	    },
	    {
		xtype: 'pveSecurityGroups',
		title: gettext('Security Group'),
		groups: ['firewall'],
		iconCls: 'fa fa-group',
		onlineHelp: 'chapter-pve-firewall.html#_security_groups',
		itemId: 'firewall-sg'
	    },
	    {
		xtype: 'pveFirewallAliases',
		title: gettext('Alias'),
		groups: ['firewall'],
		iconCls: 'fa fa-external-link',
		onlineHelp: 'chapter-pve-firewall.html#_ip_aliases',
		base_url: '/cluster/firewall/aliases',
		itemId: 'firewall-aliases'
	    },
	    {
		xtype: 'pveIPSet',
		title: 'IPSet',
		groups: ['firewall'],
		iconCls: 'fa fa-list-ol',
		onlineHelp: 'chapter-pve-firewall.html#_ip_sets',
		base_url: '/cluster/firewall/ipset',
		list_refs_url: '/cluster/firewall/refs',
		itemId: 'firewall-ipset'
	    },
	    {
		xtype: 'pveDcSupport',
		title: gettext('Support'),
		itemId: 'support',
		onlineHelp: 'chapter-sysadmin.html#_getting_help',
		iconCls: 'fa fa-comments-o'
	    });
	}

	me.callParent();
   }
});
