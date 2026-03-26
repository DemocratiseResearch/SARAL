import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  FiPlus, FiFile, FiClock, FiCheck, FiArrowRight, 
  FiDownload, FiPlay, FiTrash2, FiEdit3 
} from 'react-icons/fi';
import Layout from '../components/common/Layout';
import { useWorkflow } from '../contexts/WorkflowContext';
import { apiService } from '../services/api';
import toast from '../services/toastService';

const ProjectCard = ({ project, onDelete, delay = 0 }) => {
  const getStatusIcon = (status) => {
    switch (status) {
    case 'completed': return <FiCheck className="w-4 h-4 text-green-500" />;
    case 'processing': return <FiClock className="w-4 h-4 text-orange-500" />;
    default: return <FiFile className="w-4 h-4 text-neutral-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
    case 'completed': return 'Completed';
    case 'processing': return 'In Progress';
    default: return 'Draft';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay }}
      className="card p-6 hover:shadow-lg transition-shadow duration-150"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-900 dark:text-white truncate mb-1">
            {project.title || 'Untitled Project'}
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
            {project.authors || 'No authors specified'}
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-full">
            {getStatusIcon(project.status)}
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {getStatusText(project.status)}
            </span>
          </div>
          
          <button
            onClick={() => onDelete(project.id)}
            className="p-1.5 text-neutral-400 hover:text-red-500 rounded transition-colors duration-150"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          <p>Created: {new Date(project.created_at).toLocaleDateString()}</p>
          {project.last_modified && (
            <p>Modified: {new Date(project.last_modified).toLocaleDateString()}</p>
            )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            {project.status === 'completed' && (
              <>
              <button className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded transition-colors duration-150">
                <FiDownload className="w-4 h-4" />
              </button>
              <button className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded transition-colors duration-150">
                <FiPlay className="w-4 h-4" />
              </button>
              </>
              )}
          </div>
          
          <Link
            to={`/paper-processing?project=${project.id}`}
            className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150"
          >
            {project.status === 'completed' ? 'View' : 'Continue'}
            <FiArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </motion.div>
    );
};

const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15 }}
    className="text-center py-16"
  >
    <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
      <FiFile className="w-8 h-8 text-neutral-400" />
    </div>
    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
      No projects yet
    </h3>
    <p className="text-neutral-600 dark:text-neutral-400 mb-6 max-w-md mx-auto">
      Create your first project by uploading a research paper or importing from arXiv.
    </p>
    <Link to="/paper-processing" className="btn-primary">
    <FiPlus className="w-4 h-4 mr-2" />
    Create Project
  </Link>
</motion.div>
);

const Dashboard = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const { resetWorkflow } = useWorkflow();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      // const response = await apiService.getProjects();
      // setProjects(response.data);
      
      // Mock data for now
      setProjects([
        {
          id: '1',
          title: 'Deep Learning for Computer Vision',
          authors: 'John Doe, Jane Smith',
          status: 'completed',
          created_at: new Date(Date.now() - 86400000 * 7),
          last_modified: new Date(Date.now() - 86400000 * 2)
        },
        {
          id: '2', 
          title: 'Natural Language Processing Applications',
          authors: 'Alice Johnson',
          status: 'processing',
          created_at: new Date(Date.now() - 86400000 * 3),
          last_modified: new Date(Date.now() - 86400000)
        }
      ]);
    } catch (error) {
      console.error('Error loading projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    
    try {
      // await apiService.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      toast.success('Project deleted successfully');
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const handleNewProject = () => {
    resetWorkflow();
  };

  return (
    <Layout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
              Your Projects
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              Manage your research paper video projects
            </p>
          </div>
          
          <Link
            to="/paper-processing"
            onClick={handleNewProject}
            className="btn-primary"
          >
            <FiPlus className="w-4 h-4 mr-2" />
            New Project
          </Link>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded mb-3" />
                <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded mb-4 w-2/3" />
                <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded mb-2" />
                <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2" />
              </div>
              ))}
          </div>
          ) : projects.length === 0 ? (
          <EmptyState />
          ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDeleteProject}
                delay={index * 0.05}
                />
                ))}
          </div>
          )}

        {/* Quick Stats */}
          {projects.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: 0.2 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {projects.length}
                </div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Total Projects</div>
              </div>
              
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {projects.filter(p => p.status === 'completed').length}
                </div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Completed</div>
              </div>
              
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {projects.filter(p => p.status === 'processing').length}
                </div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">In Progress</div>
              </div>
              
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-neutral-600 dark:text-neutral-400">
                  {projects.filter(p => p.status === 'draft').length}
                </div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Drafts</div>
              </div>
            </motion.div>
            )}
        </div>
      </Layout>
      );
};

export default Dashboard;
