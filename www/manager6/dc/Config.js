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
	    hstateid: 'dctab',
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		title: gettext('Summary'),
		xtype: 'pveDcSummary',
		iconCls: 'fa fa-book',
		itemId: 'summary',
	    },
	    {
		xtype: 'pmxNotesView',
		title: gettext('Notes'),
		iconCls: 'fa fa-sticky-note-o',
		itemId: 'notes',
	    },
	    {
		title: gettext('Cluster'),
		xtype: 'pveClusterAdministration',
		iconCls: 'fa fa-server',
		itemId: 'cluster',
	    },
	    {
		title: 'Ceph',
		itemId: 'ceph',
		iconCls: 'fa fa-ceph',
		xtype: 'pveNodeCephStatus',
	    },
	    {
		xtype: 'pveDcOptionView',
		title: gettext('Options'),
		iconCls: 'fa fa-gear',
		itemId: 'options',
	    });
	}

	if (caps.storage['Datastore.Allocate'] || caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveStorageView',
		title: gettext('Storage'),
		iconCls: 'fa fa-database',
		itemId: 'storage',
	    });
	}


	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveDcBackupView',
		iconCls: 'fa fa-floppy-o',
		title: gettext('Backup'),
		itemId: 'backup',
	    },
	    {
		xtype: 'pveReplicaView',
		iconCls: 'fa fa-retweet',
		title: gettext('Replication'),
		itemId: 'replication',
	    },
	    {
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		iconCls: 'fa fa-unlock',
		itemId: 'permissions',
		expandedOnInit: true,
	    });
	}

	me.items.push({
	    xtype: 'pveUserView',
	    groups: ['permissions'],
	    iconCls: 'fa fa-user',
	    title: gettext('Users'),
	    itemId: 'users',
	});

	me.items.push({
	    xtype: 'pveTokenView',
	    groups: ['permissions'],
	    iconCls: 'fa fa-user-o',
	    title: gettext('API Tokens'),
	    itemId: 'apitokens',
	});

	me.items.push({
	    xtype: 'pmxTfaView',
	    title: gettext('Two Factor'),
	    groups: ['permissions'],
	    iconCls: 'fa fa-key',
	    itemId: 'tfa',
	    yubicoEnabled: true,
	    issuerName: `Proxmox VE - ${PVE.ClusterName || Proxmox.NodeName}`,
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveGroupView',
		title: gettext('Groups'),
		iconCls: 'fa fa-users',
		groups: ['permissions'],
		itemId: 'groups',
	    },
	    {
		xtype: 'pvePoolView',
		title: gettext('Pools'),
		iconCls: 'fa fa-tags',
		groups: ['permissions'],
		itemId: 'pools',
	    },
	    {
		xtype: 'pveRoleView',
		title: gettext('Roles'),
		iconCls: 'fa fa-male',
		groups: ['permissions'],
		itemId: 'roles',
	    },
	    {
		title: gettext('Realms'),
		xtype: 'panel',
		layout: {
		    type: 'border',
		},
		groups: ['permissions'],
		iconCls: 'fa fa-address-book-o',
		itemId: 'domains',
		items: [
		    {
			xtype: 'pveAuthView',
			region: 'center',
			border: false,
		    },
		    {
			xtype: 'pveRealmSyncJobView',
			title: gettext('Realm Sync Jobs'),
			region: 'south',
			collapsible: true,
			animCollapse: false,
			border: false,
			height: '50%',
		    },
		],
	    },
	    {
		xtype: 'pveHAStatus',
		title: 'HA',
		iconCls: 'fa fa-heartbeat',
		itemId: 'ha',
	    },
	    {
		title: gettext('Groups'),
		groups: ['ha'],
		xtype: 'pveHAGroupsView',
		iconCls: 'fa fa-object-group',
		itemId: 'ha-groups',
	    },
	    {
		title: gettext('Fencing'),
		groups: ['ha'],
		iconCls: 'fa fa-bolt',
		xtype: 'pveFencingView',
		itemId: 'ha-fencing',
	    });
	    // always show on initial load, will be hiddea later if the SDN API calls don't exist,
	    // else it won't be shown at first if the user initially loads with DC selected
	    if (PVE.SDNInfo || PVE.SDNInfo === undefined) {
		me.items.push({
		    xtype: 'pveSDNStatus',
		    title: gettext('SDN'),
		    iconCls: 'fa fa-sdn',
		    hidden: true,
		    itemId: 'sdn',
		    expandedOnInit: true,
		},
		{
		    xtype: 'pveSDNZoneView',
		    groups: ['sdn'],
		    title: gettext('Zones'),
		    hidden: true,
		    iconCls: 'fa fa-th',
		    itemId: 'sdnzone',
		},
		{
		    xtype: 'pveSDNVnet',
		    groups: ['sdn'],
		    title: 'VNets',
		    hidden: true,
		    iconCls: 'fa fa-network-wired',
		    itemId: 'sdnvnet',
		},
		{
		    xtype: 'pveSDNOptions',
		    groups: ['sdn'],
		    title: gettext('Options'),
		    hidden: true,
		    iconCls: 'fa fa-gear',
		    itemId: 'sdnoptions',
		});
	    }

	    if (Proxmox.UserName === 'root@pam') {
		me.items.push({
		    xtype: 'pveACMEClusterView',
		    title: 'ACME',
		    iconCls: 'fa fa-certificate',
		    itemId: 'acme',
		});
	    }

	    me.items.push({
		xtype: 'pveFirewallRules',
		title: gettext('Firewall'),
		allow_iface: true,
		base_url: '/cluster/firewall/rules',
		list_refs_url: '/cluster/firewall/refs',
		iconCls: 'fa fa-shield',
		itemId: 'firewall',
	    },
	    {
		xtype: 'pveFirewallOptions',
		title: gettext('Options'),
		groups: ['firewall'],
		iconCls: 'fa fa-gear',
		base_url: '/cluster/firewall/options',
		onlineHelp: 'pve_firewall_cluster_wide_setup',
		fwtype: 'dc',
		itemId: 'firewall-options',
	    },
	    {
		xtype: 'pveSecurityGroups',
		title: gettext('Security Group'),
		groups: ['firewall'],
		iconCls: 'fa fa-group',
		itemId: 'firewall-sg',
	    },
	    {
		xtype: 'pveFirewallAliases',
		title: gettext('Alias'),
		groups: ['firewall'],
		iconCls: 'fa fa-external-link',
		base_url: '/cluster/firewall/aliases',
		itemId: 'firewall-aliases',
	    },
	    {
		xtype: 'pveIPSet',
		title: 'IPSet',
		groups: ['firewall'],
		iconCls: 'fa fa-list-ol',
		base_url: '/cluster/firewall/ipset',
		list_refs_url: '/cluster/firewall/refs',
		itemId: 'firewall-ipset',
	    },
	    {
		xtype: 'pveMetricServerView',
		title: gettext('Metric Server'),
		iconCls: 'fa fa-bar-chart',
		itemId: 'metricservers',
		onlineHelp: 'external_metric_server',
	    });
	}

	if (caps.mapping['Mapping.Audit'] ||
	    caps.mapping['Mapping.Use'] ||
	    caps.mapping['Mapping.Modify']) {
	    me.items.push(
		{
		    xtype: 'container',
		    onlineHelp: 'resource_mapping',
		    title: gettext('Resource Mappings'),
		    itemId: 'resources',
		    iconCls: 'fa fa-folder-o',
		    layout: {
			type: 'vbox',
			align: 'stretch',
			multi: true,
		    },
		    scrollable: true,
		    defaults: {
			border: false,
		    },
		    items: [
			{
			    xtype: 'pveDcPCIMapView',
			    title: gettext('PCI Devices'),
			    flex: 1,
			},
			{
			    xtype: 'splitter',
			    collapsible: false,
			    performCollapse: false,
			},
			{
			    xtype: 'pveDcUSBMapView',
			    title: gettext('USB Devices'),
			    flex: 1,
			},
		    ],
		},
	    );
	}

	if (caps.mapping['Mapping.Audit'] ||
	    caps.mapping['Mapping.Use'] ||
	    caps.mapping['Mapping.Modify']) {
	    me.items.push(
		{
		    xtype: 'pmxNotificationConfigView',
		    title: gettext('Notifications'),
		    itemId: 'notification-targets',
		    iconCls: 'fa fa-bell-o',
		    baseUrl: '/cluster/notifications',
		},
	    );
	}

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveDcSupport',
		title: gettext('Support'),
		itemId: 'support',
		iconCls: 'fa fa-comments-o',
	    });
	}

	me.callParent();
   },
});
