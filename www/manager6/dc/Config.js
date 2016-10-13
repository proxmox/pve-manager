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
		onlineHelp: 'datacenter_configuration_file',
		iconCls: 'fa fa-gear',
		itemId: 'options'
	    });
	}

	if (caps.storage['Datastore.Allocate'] || caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveStorageView',
		title: gettext('Storage'),
		onlineHelp: 'chapter_storage',
		iconCls: 'fa fa-database',
		itemId: 'storage'
	    });
	}

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveDcBackupView',
		iconCls: 'fa fa-floppy-o',
		onlineHelp: 'chapter_vzdump',
		title: gettext('Backup'),
		itemId: 'backup'
	    },
	    {
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		iconCls: 'fa fa-unlock',
		onlineHelp: 'chapter_user_management',
		itemId: 'permissions',
		expandedOnInit: true
	    });
	}

	me.items.push({
	    xtype: 'pveUserView',
	    groups: ['permissions'],
	    iconCls: 'fa fa-user',
	    onlineHelp: 'pveum_users',
	    title: gettext('Users'),
	    itemId: 'users'
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveGroupView',
		title: gettext('Groups'),
		iconCls: 'fa fa-users',
		onlineHelp: 'pveum_groups',
		groups: ['permissions'],
		itemId: 'groups'
	    },
	    {
		xtype: 'pvePoolView',
		title: gettext('Pools'),
		iconCls: 'fa fa-tags',
		onlineHelp: 'pveum_pools',
		groups: ['permissions'],
		itemId: 'pools'
	    },
	    {
		xtype: 'pveRoleView',
		title: gettext('Roles'),
		iconCls: 'fa fa-male',
		onlineHelp: 'pveum_roles',
		groups: ['permissions'],
		itemId: 'roles'
	    },
	    {
		xtype: 'pveAuthView',
		title: gettext('Authentication'),
		groups: ['permissions'],
		onlineHelp: 'pveum_authentication_realms',
		iconCls: 'fa fa-key',
		itemId: 'domains'
	    },
	    {
		xtype: 'pveHAStatusView',
		title: 'HA',
		iconCls: 'fa fa-heartbeat',
		onlineHelp: 'chapter_ha_manager',
		itemId: 'ha'
	    },
	    {
		title: gettext('Resources'),
		groups: ['ha'],
		iconCls: 'fa fa-th',
		onlineHelp: 'ha_manager_resources',
		xtype: 'pveHAResourcesView',
		itemId: 'resources'
	    },
	    {
		title: gettext('Groups'),
		groups: ['ha'],
		xtype: 'pveHAGroupsView',
		onlineHelp: 'ha_manager_groups',
		iconCls: 'fa fa-object-group',
		itemId: 'ha-groups'
	    },
	    {
		title: gettext('Fencing'),
		groups: ['ha'],
		iconCls: 'fa fa-bolt',
		onlineHelp: 'ha_manager_fencing',
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
		onlineHelp: 'chapter_pve_firewall',
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
		onlineHelp: 'pve_firewall_security_groups',
		itemId: 'firewall-sg'
	    },
	    {
		xtype: 'pveFirewallAliases',
		title: gettext('Alias'),
		groups: ['firewall'],
		iconCls: 'fa fa-external-link',
		onlineHelp: 'pve_firewall_ip_aliases',
		base_url: '/cluster/firewall/aliases',
		itemId: 'firewall-aliases'
	    },
	    {
		xtype: 'pveIPSet',
		title: 'IPSet',
		groups: ['firewall'],
		iconCls: 'fa fa-list-ol',
		onlineHelp: 'pve_firewall_ip_sets',
		base_url: '/cluster/firewall/ipset',
		list_refs_url: '/cluster/firewall/refs',
		itemId: 'firewall-ipset'
	    },
	    {
		xtype: 'pveDcSupport',
		title: gettext('Support'),
		itemId: 'support',
		onlineHelp: 'getting_help',
		iconCls: 'fa fa-comments-o'
	    });
	}

	me.callParent();
   }
});
