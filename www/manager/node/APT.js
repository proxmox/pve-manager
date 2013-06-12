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

	var groupingFeature = Ext.create('Ext.grid.feature.Grouping', {
            groupHeaderTpl: '{[ "Section: " + values.name ]} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})'
	});

	var rowBodyFeature = Ext.create('Ext.grid.feature.RowBody', {
            getAdditionalData: function (data, rowIndex, record, orig) {
                var headerCt = this.view.headerCt;
                var colspan = headerCt.getColumnCount();
                // Usually you would style the my-body-class in CSS file
                return {
                    rowBody: '<div style="padding: 1em">' + data.Description + '</div>',
                    rowBodyColspan: colspan
                };
	    }
	});

	var reload = function() {
	    store.load();
	};

	me.loadCount = 1; // avoid duplicate load mask
	PVE.Utils.monStoreErrors(me, store);

	var apt_command = function(cmd){
	    PVE.Utils.API2Request({
		url: "/nodes/" + nodename + "/apt/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
		success: function(response, opts) {
		    var upid = response.result.data;

		    var win = Ext.create('PVE.window.TaskProgress', { 
			upid: upid
		    });
		    win.show();
		    me.mon(win, 'close', reload);
		}
	    });
	};

	var update_btn = new Ext.Button({
	    text: gettext('Update'),
	    handler: function(){
		apt_command('update');
	    }
	});

	var upgrade_btn = new Ext.Button({
	    text: gettext('Upgrade'),
	    handler: function(){
		apt_command('upgrade');
	    }
	});

	Ext.apply(me, {
	    store: store,
	    stateful: false,
            viewConfig: {
		stripeRows: false,
		emptyText: '<div style="display:table; width:100%; height:100%;"><div style="display:table-cell; vertical-align: middle; text-align:center;"><b>' + gettext('Your system is up to date.') + '</div></div>'
	    },
	    tbar: [ update_btn, upgrade_btn ],
	    features: [ groupingFeature, rowBodyFeature ],
	    columns: [
		{
		    header: gettext('Package'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'Package'
		},
		{
		    text: gettext('Version'),
		    columns: [
			{
			    header: gettext('current'),
			    width: 100,
			    sortable: false,
			    dataIndex: 'OldVersion'
			},
			{
			    header: gettext('new'),
			    width: 100,
			    sortable: false,
			    dataIndex: 'Version'
			}
		    ]
		},
		{
		    header: gettext('Description'),
		    sortable: false,
		    dataIndex: 'Title',
		    flex: 1
		}
	    ],
	    listeners: { 
		show: reload
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('apt-pkglist', {
	extend: 'Ext.data.Model',
	fields: [ 'Package', 'Title', 'Description', 'Section', 'Arch',
		  'Priority', 'Version', 'OldVersion' ],
	idProperty: 'Package'
    });

});
