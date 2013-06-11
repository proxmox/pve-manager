Ext.define('PVE.node.APT', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveNodeAPT'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    model: 'apt-pkglist',
	    groupField: 'Section',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/apt/update"
	    },
	    sorters: [
		{
		    property : 'Package',
		    direction: 'ASC'
		}
	    ]
	});

	var groupingFeature = Ext.create('Ext.grid.feature.Grouping',{
            groupHeaderTpl: '{[ "Section: " + values.name ]} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})'
	});

	var reload = function() {
	    store.load();
	};

	PVE.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    //tbar: [ start_btn, stop_btn, restart_btn ],
	    features: [ groupingFeature ],
	    columns: [
		{
		    header: gettext('Package'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'Package'
		},
		{
		    header: gettext('Version'),
		    width: 100,
		    sortable: false,
		    dataIndex: 'Version'
		},
		{
		    header: gettext('Description'),
		    sortable: false,
		    dataIndex: 'Title',
		    flex: 1
		}
	    ],
	    listeners: { 
		show: function() {
		    // only load once (because this takes several seconds)
		    if (!me.alreadyLoaded) {
			reload();
			me.alreadyLoaded = true;
		    }
		}
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('apt-pkglist', {
	extend: 'Ext.data.Model',
	fields: [ 'Package', 'Title', 'Description', 'Section', 'Arch',
		  'Priority', 'Version' ],
	idProperty: 'Package'
    });

});
