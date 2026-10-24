"""Controlled research paper fixtures for template testing across domains."""

# Fixture 1: Computer Science / NLP Paper with Math and Metrics
TRANSFORMER_SCRIPT = {
    "title": "Attention Is All You Need: Scalable Transformers for NLP",
    "authors": "Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit",
    "date": "NeurIPS 2017",
    "language": "en-IN",
    "ppt_template": "saral",
    "sections": [
        {
            "id": "sec_problem",
            "title": "Problem & Motivation",
            "summary": "Recurrent neural networks are inherently sequential and cannot parallelize.",
            "bullets": [
                "Sequential computation precludes parallelization within training examples.",
                "Memory constraints limit batch sizes across long sequence lengths.",
                "Computational complexity scales linearly $O(n)$ with sequential distance.",
            ],
        },
        {
            "id": "sec_question",
            "title": "Core Research Question",
            "summary": "Can sequence transduction be achieved entirely through self-attention?",
            "bullets": [
                "Can attention mechanisms replace recurrence entirely without losing temporal context?",
                "Achieve constant $O(1)$ sequential operations for arbitrary distance dependencies.",
            ],
        },
        {
            "id": "sec_method",
            "title": "Methodology: Multi-Head Attention",
            "summary": "The Transformer uses stacked self-attention and point-wise fully connected layers.",
            "bullets": [
                "Scaled Dot-Product Attention: $\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$.",
                "Multi-Head Attention projects queries, keys, and values $h=8$ times in parallel.",
                "Sinusoidal positional encodings inject sequence order without recurrence.",
            ],
        },
        {
            "id": "sec_results",
            "title": "Experimental Results & Benchmark",
            "summary": "State-of-the-art BLEU scores on WMT English-to-German and English-to-French.",
            "bullets": [
                "Establishes a new SOTA score of 28.4 BLEU on WMT 2014 English-to-German.",
                "Improves WMT English-to-French translation to 41.8 BLEU with a single model.",
                "Requires only 3.5 days of training on 8 NVIDIA P100 GPUs (a fraction of prior cost).",
            ],
        },
        {
            "id": "sec_comparison",
            "title": "Comparative Evaluation vs Baselines",
            "summary": "Comparison against GNMT, ByteNet, and ConvS2S.",
            "bullets": [
                "Recurrent Baselines (GNMT): 26.3 BLEU, high latency due to sequential tokens.",
                "Convolutional Baselines (ConvS2S): 25.1 BLEU, $O(\\log n)$ operations.",
                "Transformer (Proposed): 28.4 BLEU, $O(1)$ operations, fully parallel training.",
            ],
        },
        {
            "id": "sec_limitations",
            "title": "Limitations & Scope",
            "summary": "Quadratic memory complexity with respect to sequence length.",
            "bullets": [
                "Self-attention scales quadratically $O(n^2)$ with sequence length $n$.",
                "High GPU VRAM consumption for document-level contexts ($n > 2048$).",
                "Future work must investigate sparse attention patterns for long documents.",
            ],
        },
        {
            "id": "sec_conclusion",
            "title": "Conclusion & Final Verdict",
            "summary": "Attention-only architectures revolutionize sequence modeling.",
            "bullets": [
                "Transformers eliminate recurrent inductive bias while outperforming recurrent networks.",
                "Paves the way for large-scale pre-training across vision, audio, and language.",
            ],
        },
    ],
}

TRANSFORMER_POSTER = {
    "title": "Attention Is All You Need",
    "authors": "Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit (Google Brain)",
    "abstract": "We propose the Transformer, a model architecture eschewing recurrence and relying entirely on an attention mechanism to draw global dependencies between input and output.",
    "introduction": [
        "Dominant sequence models rely on recurrent neural networks (RNNs, LSTMs).",
        "Sequential nature precludes parallelization during training.",
        "Attention mechanisms allow modeling dependencies regardless of temporal distance.",
    ],
    "methodology": [
        "Encoder-decoder stack with 6 identical layers.",
        "Multi-Head Attention: projects queries, keys, and values into 8 parallel subspaces.",
        "Point-wise Feed-Forward networks and Sinusoidal Positional Encoding.",
    ],
    "results": [
        "Achieves 28.4 BLEU on WMT 2014 English-to-German translation (+2.0 over best baseline).",
        "Achieves 41.8 BLEU on WMT 2014 English-to-French after 3.5 days on 8 P100 GPUs.",
        "Generalizes successfully to English constituency parsing with 91.3 F1.",
    ],
    "conclusion": [
        "First sequence transduction model based entirely on self-attention.",
        "Drastically faster training with superior translation quality across benchmarks.",
    ],
    "references": [
        "Vaswani et al. (2017) Attention Is All You Need. NeurIPS.",
        "Bahdanau et al. (2014) Neural Machine Translation by Jointly Learning to Align and Translate. ICLR.",
    ],
}

# Fixture 2: Qualitative Paper with No Numerical Metrics
QUALITATIVE_POSTER = {
    "title": "Ethnographic Analysis of Algorithmic Governance in Platform Work",
    "authors": "Elena Rostova, Marcus Thorne (Department of Sociology, Oxford)",
    "abstract": "This study examines how gig economy workers negotiate algorithmic evaluation and managerial control through collective digital resistance.",
    "introduction": [
        "Platform algorithms increasingly substitute for human supervisory hierarchies.",
        "Workers experience information asymmetry and opaque decision-making regimes.",
    ],
    "methodology": [
        "Semi-structured qualitative interviews with 48 ride-hailing drivers across two cities.",
        "Eighteen months of participatory digital observation within private driver forums.",
    ],
    "results": [
        "Drivers construct informal shadow networks to coordinate collective surge strategies.",
        "Algorithmic resistance manifests primarily as tactical gamification and intentional spoofing.",
    ],
    "conclusion": [
        "Algorithmic governance produces collective counter-strategies rather than passive compliance.",
        "Policy frameworks must mandate algorithmic transparency and appeal rights.",
    ],
    "references": [
        "Zuboff, S. (2019) The Age of Surveillance Capitalism. PublicAffairs.",
        "Kellogg et al. (2020) Algorithms at Work. Organization Science.",
    ],
}

# Fixture 3: Multilingual Hindi Research Paper
HINDI_SCRIPT = {
    "title": "भारतीय भाषाओं में प्राकृतिक भाषा प्रसंस्करण: चुनौतियाँ एवं समाधान",
    "authors": "डॉ. राजेश शर्मा, प्रो. सुनीता वर्मा (आईआईटी दिल्ली)",
    "date": "अक्टूबर 2026",
    "language": "hi-IN",
    "ppt_template": "saral",
    "sections": [
        {
            "id": "h_sec1",
            "title": "समस्या और प्रेरणा",
            "summary": "भारतीय भाषाओं में डिजिटल डेटा की कमी एक बड़ी चुनौती है।",
            "bullets": [
                "विविध लिपियों और व्याकरणिक संरचनाओं के कारण संसाधन-अभाव की समस्या।",
                "उच्च गुणवत्ता वाले समांतर कॉर्पोरा की भारी कमी।",
            ],
        },
        {
            "id": "h_sec2",
            "title": "प्रस्तावित पद्धति",
            "summary": "बहुभाषी अनुवाद मॉडल का विकास।",
            "bullets": [
                "22 अनुसूचित भाषाओं के लिए साझा टोकनाइज़ेशन रणनीति।",
                "ट्रांसफर लर्निंग द्वारा कम संसाधन वाली भाषाओं का संवर्धन।",
            ],
        },
    ],
}

# Fixture 4: Sparse Edge Case Paper
SPARSE_SCRIPT = {
    "title": "A Preliminary Note on Quantum Walks",
    "authors": "",
    "date": "",
    "language": "en-IN",
    "sections": [
        {
            "id": "sparse_1",
            "title": "Preliminary Findings",
            "summary": "",
            "bullets": ["Quantum walks exhibit quadratic speedup over classical random walks."],
        }
    ],
}
